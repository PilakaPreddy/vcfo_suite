import 'server-only';

import { systemMeetingPeople } from '@/db/repositories/board-meetings';
import {
  systemClaimSlaLevel,
  systemListHealthEngagements,
  systemOpenComplianceItems,
  systemRawHealthCounts,
  systemSaveHealth,
  systemSentSlaLevels,
  systemSetCheckInTask,
  systemStepEnteredOn,
} from '@/db/repositories/client-health';
import { checklistStateFromRow, type EngagementDbRow } from '@/db/repositories/engagements';
import { systemStaffContext } from '@/db/repositories/expiry-items';
import { systemStaffContacts } from '@/db/repositories/notice-cases';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { createTask } from '@/db/repositories/tasks';
import type { SlaLevel } from '@/data/sla';
import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { normalizeEngagementSchedule } from '@/lib/projects/schedule-windows';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { siteUrl } from '@/lib/site-url';
import { HEALTH_BAND_LABEL, computeHealth, needsPartnerCheckIn, type HealthBand } from './score';
import { healthInputsFrom } from './signals';
import { addDays, complianceClock, dueLevels, slaNoticeCopy, stageLabelOf, stepClocks, type SlaClock } from './sla';
import { healthBoardHref, nudgeClientHref, projectHref, roleBase, stepHref } from './links';

/**
 * The nightly client health run (IDEAS-PLAN wave 2, section E), driven by
 * src/jobs/client-health-nightly.ts. Everything here stays inside the firm: bells, emails to
 * staff and an internal task. Nothing goes to a client; the "Nudge client" link opens the
 * compose screen for a person to send.
 *
 *  1. `computeAllHealth` reads the raw signals of every live client in a few grouped queries,
 *     scores them (score.ts) and stores the result. It returns the clients whose band fell by two
 *     levels or more since the last run.
 *  2. `openPartnerCheckIn` opens a check-in task for the partner (the engagement's admin, else a
 *     firm admin), with a bell and an email plan.
 *  3. `planSlaLadder` finds, per client, the open steps and compliance items whose clock has
 *     passed 1x, 2x or 3x their SLA for a level not sent yet.
 *  4. `runSlaLadder` claims each level in `sla_escalations` (so a rerun sends nothing twice),
 *     writes the bells and returns the email plans.
 */

export interface StaffEmailPlan {
  key: string;
  profileId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface HealthFall {
  engagementId: string;
  companyName: string;
  from: HealthBand;
  to: HealthBand;
  score: number;
}

type Person = { id: string; name: string; email: string };

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

/** Scores and stores every live client. Returns the falls of two bands or more. */
export async function computeAllHealth(today: string, now: Date = new Date()): Promise<{ computed: number; falls: HealthFall[] }> {
  const [rows, raw] = await Promise.all([systemListHealthEngagements(), systemRawHealthCounts(today)]);
  const falls: HealthFall[] = [];
  for (const row of rows) {
    const health = computeHealth(
      healthInputsFrom({
        raw: raw.byEngagement.get(row.id),
        engagement: { stage: row.stage, createdAt: row.createdAt },
        checklistState: checklistStateFromRow(row),
        noticesAvailable: raw.noticesAvailable,
        now,
      }),
    );
    const { previousBand } = await systemSaveHealth(row.id, health, now);
    if (needsPartnerCheckIn(previousBand, health.band)) {
      falls.push({ engagementId: row.id, companyName: row.companyName, from: previousBand as HealthBand, to: health.band, score: health.score });
    }
  }
  return { computed: rows.length, falls };
}

async function engagementRow(engagementId: string): Promise<EngagementDbRow | null> {
  const rows = await systemListHealthEngagements();
  return rows.find((r) => r.id === engagementId) ?? null;
}

/** A check-in task for the partner after a fall of two bands, with a bell and an email plan. */
export async function openPartnerCheckIn(fall: HealthFall, today: string): Promise<StaffEmailPlan[]> {
  const row = await engagementRow(fall.engagementId);
  if (!row) return [];
  const people = await systemMeetingPeople(row);
  const partner = people.admin;
  if (!partner) return [];
  const actor = await systemStaffContext(partner.id);
  if (!actor) return [];
  const title = `Partner check-in: ${fall.companyName} fell from ${HEALTH_BAND_LABEL[fall.from]} to ${HEALTH_BAND_LABEL[fall.to]}`;
  const body = `The client health score is now ${fall.score} of 100. Call the client or the team this week and note what was agreed.`;
  const task = await createTask(actor, { engagementId: row.id, title, assigneeId: partner.id, dueAt: addDays(today, 3), notes: body });
  await systemSetCheckInTask(row.id, task.id);
  const href = projectHref(actor.role, row);
  await createNotificationsForUsers([
    { userId: partner.id, kind: 'compliance.task', title, body, engagementId: appEngagementId(row.id), companyName: row.companyName, href },
  ]);
  if (!partner.email) return [];
  const board = `${siteUrl()}${healthBoardHref(actor.role)}`;
  return [
    {
      key: `checkin-${row.id}`,
      profileId: partner.id,
      to: partner.email,
      subject: title,
      html: renderEmailDocument({
        eyebrow: 'Client health',
        title,
        bodyHtml: emailParagraph(`Hi ${escapeHtml(firstName(partner.name))},`) + emailParagraph(escapeHtml(body)) + emailParagraph(`<a href="${escapeHtml(board)}">Open the client health board</a>`),
        cta: { label: 'Open the client', href: `${siteUrl()}${href}` },
      }),
      text: [`Hi ${firstName(partner.name)},`, body, `Open the client: ${siteUrl()}${href}`, `Client health board: ${board}`].join('\n\n'),
    },
  ];
}

export interface SlaDue {
  engagementId: string;
  clock: SlaClock;
  stageLabel: string;
  levels: SlaLevel[];
}

/** One client's ladder levels due today and not sent yet. */
export async function planSlaForEngagement(row: EngagementDbRow, today: string): Promise<SlaDue[]> {
  const state = checklistStateFromRow(row);
  const entered = await systemStepEnteredOn(row.id);
  const enteredOn: Record<string, string> = {};
  for (const [stepId, slice] of Object.entries(state)) {
    const day = entered[stepId]?.[slice.status];
    if (day) enteredOn[stepId] = day;
  }
  const clocks: SlaClock[] = [
    ...stepClocks({ state, schedule: normalizeEngagementSchedule(row.schedule), enteredOn }),
    ...(await systemOpenComplianceItems(row.id, today)).map((c) => complianceClock(c)).filter((c): c is SlaClock => Boolean(c)),
  ];
  if (clocks.length === 0) return [];
  const sent = await systemSentSlaLevels(row.id);
  const out: SlaDue[] = [];
  for (const clock of clocks) {
    const stageLabel = stageLabelOf(clock);
    const levels = dueLevels(clock, today, sent.get(`${clock.itemKey}|${stageLabel}`));
    if (levels.length > 0) out.push({ engagementId: row.id, clock, stageLabel, levels });
  }
  return out;
}

/** Every client's ladder levels due today, grouped by client. */
export async function planSlaLadder(today: string): Promise<Array<{ engagementId: string; due: SlaDue[] }>> {
  const rows = await systemListHealthEngagements();
  const out: Array<{ engagementId: string; due: SlaDue[] }> = [];
  for (const row of rows) {
    const due = await planSlaForEngagement(row, today);
    if (due.length > 0) out.push({ engagementId: row.id, due });
  }
  return out;
}

/** The person each level reaches: the lead (the manager when there is no lead), the manager, the partner. */
export function ladderRecipient(level: SlaLevel, people: { lead: Person | null; manager: Person | null; admin: Person | null }): Person | null {
  if (level === 'lead') return people.lead ?? people.manager;
  if (level === 'manager') return people.manager ?? people.admin;
  return people.admin;
}

/** Claims and sends (bells) one client's due levels; returns the emails for the job to send. */
export async function runSlaLadder(engagementId: string, due: SlaDue[], today: string): Promise<StaffEmailPlan[]> {
  const row = await engagementRow(engagementId);
  if (!row || due.length === 0) return [];
  const people = await systemMeetingPeople(row);
  const contacts = await systemStaffContacts([people.lead?.id, people.manager?.id, people.admin?.id]);
  const contact = (p: { id: string } | null): Person | null => (p ? (contacts.find((c) => c.id === p.id) ?? null) : null);
  const roleOf = (id: string) => contacts.find((c) => c.id === id)?.role ?? 'admin';
  const resolved = { lead: contact(people.lead), manager: contact(people.manager), admin: contact(people.admin) };

  const bells: Parameters<typeof createNotificationsForUsers>[0] = [];
  const plans: StaffEmailPlan[] = [];
  for (const d of due) {
    // One person hears once per item per night, even when two levels land on them.
    const told = new Set<string>();
    for (const level of d.levels) {
      const person = ladderRecipient(level, resolved);
      // Claim even when nobody holds the role, so the level is not retried every night.
      const claimed = await systemClaimSlaLevel({ engagementId, itemKey: d.clock.itemKey, stageLabel: d.stageLabel, level });
      if (!claimed || !person || told.has(person.id)) continue;
      told.add(person.id);
      const role = roleOf(person.id);
      const copy = slaNoticeCopy({ clock: d.clock, level, companyName: row.companyName, today });
      const open = d.clock.stepId ? stepHref(role, row, d.clock.stepId) : `${roleBase(role)}/compliances/filings`;
      const nudge = nudgeClientHref(role, row.companyName, d.clock.title);
      const reassign = projectHref(role, row);
      bells.push({ userId: person.id, kind: 'compliance.reminder', title: copy.title, body: copy.body, engagementId: appEngagementId(row.id), companyName: row.companyName, itemId: d.clock.stepId, href: open });
      if (!person.email) continue;
      const abs = (p: string) => `${siteUrl()}${p}`;
      plans.push({
        key: `sla-${row.id}-${d.clock.itemKey}-${level}`,
        profileId: person.id,
        to: person.email,
        subject: copy.title,
        html: renderEmailDocument({
          eyebrow: 'SLA ladder',
          title: copy.title,
          bodyHtml:
            emailParagraph(`Hi ${escapeHtml(firstName(person.name))},`) +
            emailParagraph(escapeHtml(copy.body)) +
            emailParagraph(`<a href="${escapeHtml(abs(nudge))}">Nudge the client</a> &middot; <a href="${escapeHtml(abs(reassign))}">Reassign</a>`),
          cta: { label: 'Open the item', href: abs(open) },
        }),
        text: [`Hi ${firstName(person.name)},`, copy.body, `Open the item: ${abs(open)}`, `Nudge the client: ${abs(nudge)}`, `Reassign: ${abs(reassign)}`].join('\n\n'),
      });
    }
  }
  if (bells.length > 0) await createNotificationsForUsers(bells);
  return plans;
}
