import 'server-only';

import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  complianceInstanceWorkflow,
  complianceInstances,
  engagementComplianceTriggers,
  engagements,
  regCalendarProposals,
  regUpdates,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { affectedClients, obligationName, obligationsNamedIn, updateText, type ClientFacts, type UpdateForImpact } from '@/lib/watch/affected';
import { proposalsFor, type CalendarChange } from '@/lib/watch/calendar-proposal';
import { isWatchStaff } from '@/lib/watch/recipients';
import type { CalendarProposalView, WatchClientRef, WatchImpact } from '@/lib/watch/types';
import { moveFilingPeriod, systemApprovedCalendarChanges, systemFilingPeriodRows, type MovedFiling } from './compliance';
import { listScopedEngagementIds } from './engagements';
import type { BoardWriter } from './announcements';

/**
 * Who an update touches, and the due-date changes it proposes.
 *
 * Access: staff read, and a name appears only for an engagement in the viewer's scope; firm-wide
 * counts carry no names. Only `isAdminOrManager` decides a proposal, and a statutory date moves for
 * every client it applies to, as `moveFilingPeriod` says. Clients never read this. The firm-wide reads
 * here stay private to this file and are only ever returned through that scope.
 */
const RECENT_DECISIONS_MS = 30 * 86_400_000;

type ProposalRow = typeof regCalendarProposals.$inferSelect;

async function clientFacts(): Promise<ClientFacts[]> {
  const [clients, open] = await Promise.all([
    db
      .select({
        engagementId: engagements.id,
        companyName: engagements.companyName,
        legalForm: engagements.entityLegalForm,
        questionnaire: engagements.complianceQuestionnaire,
        trigger: engagementComplianceTriggers,
        gstStep: sql<string | null>`${engagements.checklistState} #>> '{reg-4,responses,gstRegistrationDate}'`,
        tanStep: sql<string | null>`${engagements.checklistState} #>> '{reg-2,responses,panTanAllotmentDate}'`,
        pfStep: sql<string | null>`${engagements.checklistState} #>> '{reg-1,responses,pfRegistrationDate}'`,
        esiStep: sql<string | null>`${engagements.checklistState} #>> '{reg-3,responses,esiRegistrationDate}'`,
        ptStep: sql<string | null>`${engagements.checklistState} #>> '{reg-7,responses,ptRegistrationDate}'`,
      })
      .from(engagements)
      .leftJoin(engagementComplianceTriggers, eq(engagementComplianceTriggers.engagementId, engagements.id))
      .where(isNull(engagements.deletedAt)),
    db
      .selectDistinct({ engagementId: complianceInstances.engagementId, obligationId: complianceInstances.obligationId })
      .from(complianceInstances)
      .leftJoin(complianceInstanceWorkflow, eq(complianceInstanceWorkflow.instanceId, complianceInstances.id))
      .where(
        and(
          isNull(complianceInstances.filedOn),
          ne(complianceInstances.status, 'filed'),
          or(isNull(complianceInstanceWorkflow.stage), ne(complianceInstanceWorkflow.stage, 'not-applicable')),
        ),
      ),
  ]);
  const openBy = new Map<string, string[]>();
  for (const row of open) openBy.set(row.engagementId, [...(openBy.get(row.engagementId) ?? []), row.obligationId]);
  return clients.map(({ trigger, questionnaire, ...row }) => ({
    engagementId: row.engagementId,
    companyName: row.companyName,
    legalForm: row.legalForm,
    gst: Boolean(trigger?.gstRegistrationDate || row.gstStep),
    tan: Boolean(trigger?.tanRegistrationDate || trigger?.tdsLiabilityStartDate || row.tanStep),
    pf: Boolean(trigger?.pfRegistrationDate || row.pfStep),
    esi: Boolean(trigger?.esiRegistrationDate || row.esiStep),
    pt: Boolean(trigger?.ptRegistrationDate || row.ptStep),
    foreignInvestment: trigger?.hasForeignInvestment === true || (questionnaire as Record<string, unknown> | null)?.['FI-01'] === true,
    openObligations: openBy.get(row.engagementId) ?? [],
  }));
}

/** Everyone firm-wide passes for a super admin or admin; anyone else passes on their own engagements. */
async function scopeOf(ctx: AuthContext): Promise<(engagementId: string) => boolean> {
  if (isFirmWideAdmin(ctx.role)) return () => true;
  const mine = new Set(await listScopedEngagementIds(ctx));
  return (engagementId) => mine.has(engagementId);
}

function toView(
  row: Pick<ProposalRow, 'obligationId' | 'period' | 'oldDueDate' | 'newDueDate' | 'affectedEngagementIds'> & { id: string | null; status: string },
  update: { id: string; title: string },
  names: ReadonlyMap<string, string>,
  inScope: (engagementId: string) => boolean,
): CalendarProposalView {
  return {
    id: row.id,
    updateId: update.id,
    updateTitle: update.title,
    obligationName: obligationName(row.obligationId),
    period: row.period,
    oldDueDate: row.oldDueDate,
    newDueDate: row.newDueDate,
    status: row.status as CalendarProposalView['status'],
    total: row.affectedEngagementIds.length,
    clients: row.affectedEngagementIds.filter(inScope).map((id) => ({ engagementId: appEngagementId(id), companyName: names.get(id) ?? '' })),
  };
}

async function namesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: engagements.id, name: engagements.companyName }).from(engagements).where(inArray(engagements.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Called inside publish's transaction. Rows are read outside it, as nothing here changes them. */
export async function writeCalendarProposals(row: UpdateForImpact & { id: string; oldDueDate: string | null; newDueDate: string | null }, tx: BoardWriter): Promise<void> {
  const drafts = proposalsFor(row, await systemFilingPeriodRows(obligationsNamedIn(updateText(row))));
  if (drafts.length === 0) return;
  await tx
    .insert(regCalendarProposals)
    .values(drafts.map((draft) => ({ updateId: row.id, ...draft })))
    .onConflictDoNothing();
}

/**
 * The list a lead reads on an update: their own clients and why, with the firm-wide count. Until it is
 * published the change card is a preview worked out from the fields on screen.
 */
export async function getUpdateImpact(
  ctx: AuthContext,
  update: UpdateForImpact & { id: string; status: string; oldDueDate: string | null; newDueDate: string | null },
): Promise<WatchImpact> {
  if (!isWatchStaff(ctx.role)) throw new Error('not permitted');
  const [facts, inScope] = await Promise.all([clientFacts(), scopeOf(ctx)]);
  const names = new Map(facts.map((client) => [client.engagementId, client.companyName]));
  const affected = affectedClients(update, facts);
  const stored =
    update.status === 'published'
      ? await db.select().from(regCalendarProposals).where(eq(regCalendarProposals.updateId, update.id))
      : proposalsFor(update, await systemFilingPeriodRows(obligationsNamedIn(updateText(update)))).map((draft) => ({ id: null, status: 'preview', ...draft }));
  return {
    basis: affected.basis,
    total: affected.clients.length,
    clients: affected.clients
      .filter((client) => inScope(client.engagementId))
      .map((client): WatchClientRef => ({ ...client, engagementId: appEngagementId(client.engagementId) })),
    proposals: stored.map((row) => toView(row, { id: update.id, title: update.title }, names, inScope)),
  };
}

/** Open proposals first, then those decided lately. A lead sees only the ones touching their own clients. */
export async function listCalendarProposals(ctx: AuthContext): Promise<CalendarProposalView[]> {
  if (!isWatchStaff(ctx.role)) throw new Error('not permitted');
  const rows = await db
    .select({ proposal: regCalendarProposals, title: regUpdates.title })
    .from(regCalendarProposals)
    .innerJoin(regUpdates, eq(regUpdates.id, regCalendarProposals.updateId))
    .where(or(eq(regCalendarProposals.status, 'proposed'), gte(regCalendarProposals.decidedAt, new Date(Date.now() - RECENT_DECISIONS_MS))))
    .orderBy(desc(sql`${regCalendarProposals.status} = 'proposed'`), desc(regCalendarProposals.createdAt))
    .limit(50);
  const [names, inScope] = await Promise.all([namesOf(rows.flatMap((row) => row.proposal.affectedEngagementIds)), scopeOf(ctx)]);
  const views = rows.map((row) => toView(row.proposal, { id: row.proposal.updateId, title: row.title }, names, inScope));
  return isAdminOrManager(ctx.role) ? views : views.filter((view) => view.clients.length > 0);
}

/** Approved moves for the screens that work dates out from the rules in the browser. */
export async function listCalendarChanges(ctx: AuthContext): Promise<CalendarChange[]> {
  if (!isWatchStaff(ctx.role)) throw new Error('not permitted');
  return systemApprovedCalendarChanges();
}

export interface DecidedProposal {
  proposal: ProposalRow;
  moved: MovedFiling[];
}

/**
 * A manager's decision, once: only a `proposed` row qualifies, so two clicks decide it once. Approving
 * moves the filings in the same transaction and records who actually moved. Rejecting writes only the
 * decision, so the calendar stays exactly as it was.
 */
export async function decideCalendarProposal(ctx: AuthContext, id: string, decision: 'approved' | 'rejected'): Promise<DecidedProposal | null> {
  if (!isAdminOrManager(ctx.role)) throw new Error('not permitted');
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .update(regCalendarProposals)
      .set({ status: decision, decidedById: ctx.userId, decidedAt: new Date() })
      .where(and(eq(regCalendarProposals.id, id), eq(regCalendarProposals.status, 'proposed')))
      .returning();
    if (!proposal) return null;
    if (decision === 'rejected') return { proposal, moved: [] };
    const moved = await moveFilingPeriod(ctx, proposal, tx);
    const affectedEngagementIds = moved.map((row) => row.engagementId);
    await tx.update(regCalendarProposals).set({ affectedEngagementIds }).where(eq(regCalendarProposals.id, id));
    return { proposal: { ...proposal, affectedEngagementIds }, moved };
  });
}

export interface MovedAudience {
  managerId: string | null;
  companyName: string;
}

/** SYSTEM (no session): the managers and names behind filings a decision just moved, for the bell. */
export async function systemMovedAudience(engagementIds: readonly string[]): Promise<Map<string, MovedAudience>> {
  if (engagementIds.length === 0) return new Map();
  const rows = await db
    .select({ id: engagements.id, managerId: engagements.managerId, companyName: engagements.companyName })
    .from(engagements)
    .where(inArray(engagements.id, [...engagementIds]));
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}
