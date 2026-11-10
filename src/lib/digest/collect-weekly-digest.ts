import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { getClientHome } from '@/db/repositories/client-home';
import { getPortalFilings } from '@/db/repositories/client-compliances';
import { listDocumentRequests } from '@/db/repositories/document-requests';
import { listChecklistIndex, listEngagements } from '@/db/repositories/engagements';
import { getSuperFirmInsights } from '@/db/repositories/super-overview';
import { listTasks } from '@/db/repositories/tasks';
import { listClientHealth } from '@/db/repositories/client-health';
import { healthDigestSection } from '@/lib/client-health/digest';
import { buildRisks } from '@/lib/super/super-insights-model';
import { todayIso } from '@/lib/client-portal/compliances';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { adminProjectPath, adminProjectStepPath, internEngagementStepPath } from '@/lib/projects/project-step-path';
import {
  adminDigestSections,
  adminPaths,
  clientDigestSections,
  CLIENT_PATHS,
  digestWeek,
  staffDigestSections,
  staffPaths,
  type DigestFilingInput,
  type WeeklyDigest,
} from '@/lib/digest/weekly-digest';

/**
 * Reads one person's week for the digest, through the ordinary scoped repositories only.
 *
 * `ctx` is the person's own AuthContext (built by `systemListWeeklyDigestRecipients` from
 * their profile row), so every read below is limited exactly as it is in the app: a client
 * sees their own engagements, a lead the ones they lead, a manager the ones they own, an admin
 * the firm. No query here is new; nothing crosses a tenant the person could not open.
 *
 * Returns `null` for a role that gets no digest (developers).
 */
export async function collectWeeklyDigest(ctx: AuthContext, now: Date = new Date()): Promise<WeeklyDigest | null> {
  const today = todayIso(now);
  const week = digestWeek(now);
  const base = { recipientName: ctx.name, week };

  if (ctx.role === 'client') {
    const [engagements, filings] = await Promise.all([listEngagements(ctx), getPortalFilings(ctx)]);
    const homes = await Promise.all(
      engagements.map(async (e) => ({ companyName: e.companyName, home: await getClientHome(ctx, e.id, now) })),
    );
    const needs = homes.flatMap(({ companyName, home }) =>
      (home?.needs ?? []).map((n) => ({ id: n.id, title: n.title, companyName, dueDate: n.dueDate ?? null })),
    );
    const activity = homes.flatMap(({ companyName, home }) =>
      (home?.activity ?? []).map((a) => ({ id: a.id, label: a.label, at: a.at, actorName: a.actorName, action: a.action, companyName })),
    );
    return {
      ...base,
      audience: 'client',
      settingsHref: CLIENT_PATHS.settings,
      sections: clientDigestSections({ today, filings: filings.map(toFilingInput), needs, activity }),
    };
  }

  if (ctx.role === 'intern' || ctx.role === 'manager') {
    const role = ctx.role;
    const [engagements, index, filings, tasks, requests] = await Promise.all([
      listEngagements(ctx),
      listChecklistIndex(ctx),
      getPortalFilings(ctx),
      listTasks(ctx),
      listDocumentRequests(ctx),
    ]);
    const byAppId = new Map(engagements.map((e) => [appEngagementId(e.id), e]));
    const companyOf = (appId: string) => byAppId.get(appId)?.companyName ?? 'Client';

    const steps = [...byAppId.entries()].flatMap(([appId, e]) =>
      Object.entries(index[appId] ?? {}).flatMap(([stepId, slice]) => {
        const status = (slice as { status?: string } | null)?.status;
        if (status !== 'overdue' && status !== 'awaiting-client') return [];
        const item = getItem(stepId);
        if (!item) return [];
        const project = { id: appId, slug: e.slug ?? undefined };
        return [
          {
            id: `${appId}:${stepId}`,
            title: item.title,
            companyName: e.companyName,
            status,
            href: role === 'intern' ? internEngagementStepPath(project, item) : adminProjectStepPath(project, item, 'manager'),
          },
        ];
      }),
    );

    return {
      ...base,
      audience: role,
      settingsHref: staffPaths(role).settings,
      sections: [
        ...staffDigestSections(role, {
          today,
          filings: filings.map(toFilingInput),
          steps,
          tasks: tasks
            .filter((t) => !t.checklistKey?.trim())
            .map((t) => ({
              id: t.id,
              title: t.title?.trim() || 'Task',
              companyName: companyOf(t.engagementId),
              status: t.status,
              dueAt: t.dueAt ?? null,
            })),
          requests: requests.map((r) => ({ id: r.id, label: r.label, companyName: companyOf(r.engagementId), status: r.status })),
        }),
        healthDigestSection(role, await healthRows(ctx, (id) => byAppId.get(id)?.slug ?? null)),
      ],
    };
  }

  if (ctx.role === 'admin' || ctx.role === 'super_admin') {
    const role = ctx.role;
    const insights = await getSuperFirmInsights(ctx, now);
    const risks = buildRisks(insights, now).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      engagementId: r.engagementId,
      companyName: r.companyName,
      ageDays: r.ageDays,
      // The insights hrefs point at the super admin screens; an admin opens the firm shell.
      href:
        role === 'super_admin'
          ? r.href
          : r.kind === 'filing'
            ? adminPaths('admin').filings
            : adminProjectPath({ id: r.engagementId }, 'admin'),
    }));
    return {
      ...base,
      audience: role,
      settingsHref: adminPaths(role).settings,
      sections: [...adminDigestSections(role, { today, risks }), healthDigestSection(role, await healthRows(ctx, () => null))],
    };
  }

  return null;
}

/** The client health rows for the digest; a failed read (table not migrated yet) leaves the section empty. */
async function healthRows(ctx: AuthContext, slugOf: (appId: string) => string | null) {
  try {
    return (await listClientHealth(ctx)).map((h) => ({ ...h, slug: slugOf(h.engagementId) }));
  } catch {
    return [];
  }
}

function toFilingInput(f: {
  id: string;
  name: string;
  period: string;
  companyName: string;
  dueDate: string;
  filedOn: string | null;
}): DigestFilingInput {
  return { id: f.id, name: f.name, period: f.period, companyName: f.companyName, dueDate: f.dueDate, filedOn: f.filedOn };
}
