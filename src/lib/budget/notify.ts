import 'server-only';

import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { systemBudgetParties, type BudgetParty } from '@/db/repositories/budgets';
import { renderEmailDocument, emailParagraph } from '@/lib/email/email-layout';
import { sendEmail } from '@/lib/email/send-email';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { siteUrl } from '@/lib/site-url';
import { SECTION_LABEL, type BudgetSection } from './model';

/**
 * Budget messages: a bell row and an email for each person. A failed message never fails the
 * action that caused it, so everything here is caught and logged.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Where a person opens the budget. The role is not known here, so the app sends them on by role. */
const budgetHref = (budgetId: string) => `/budgets/${budgetId}`;

async function deliver(input: { budgetId: string; engagementId: string; companyName: string; people: BudgetParty[]; title: string; body: string; actor?: { id: string; name: string } }) {
  const people = [...new Map(input.people.map((p) => [p.userId, p])).values()].filter((p) => p.userId !== input.actor?.id);
  if (!people.length) return;
  const href = budgetHref(input.budgetId);
  await createNotificationsForUsers(
    people.map((p) => ({
      userId: p.userId,
      kind: 'budget.update' as const,
      title: input.title,
      body: input.body,
      engagementId: appEngagementId(input.engagementId),
      companyName: input.companyName,
      itemId: input.budgetId,
      href,
      actorId: input.actor?.id,
      actorName: input.actor?.name,
    })),
  );
  for (const p of people) {
    await sendEmail({
      to: p.email,
      subject: `${input.title}: ${input.companyName}`,
      text: `${input.body}\n\nOpen the budget: ${siteUrl()}${href}\n`,
      html: renderEmailDocument({ title: input.title, bodyHtml: emailParagraph(esc(input.body)), cta: { label: 'Open the budget', href: `${siteUrl()}${href}` } }),
      purpose: 'budget.update',
    });
  }
}

async function safely(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`[budget] ${label} message failed`, e instanceof Error ? e.message : e);
  }
}

type Actor = { id: string; name: string };

export function notifyOwnersAssigned(budgetId: string, section: BudgetSection, userIds: string[], dueDate: string | null, actor: Actor) {
  return safely('owner', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    const people = (p.ownersBySection[section] ?? []).filter((o) => userIds.includes(o.userId));
    await deliver({
      budgetId,
      engagementId: p.engagementId,
      companyName: p.companyName,
      people,
      title: `Budget tab to fill: ${SECTION_LABEL[section]}`,
      body: `Please fill the ${SECTION_LABEL[section]} tab of the ${p.fyName} budget for ${p.companyName}${dueDate ? ` by ${dueDate}` : ''}.`,
      actor,
    });
  });
}

export function notifySectionDone(budgetId: string, section: BudgetSection, actor: Actor) {
  return safely('done', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    await deliver({ budgetId, engagementId: p.engagementId, companyName: p.companyName, people: p.staff, title: `Budget tab done: ${SECTION_LABEL[section]}`, body: `${actor.name} marked the ${SECTION_LABEL[section]} tab of the ${p.fyName} budget as done.`, actor });
  });
}

export function notifySectionSentBack(budgetId: string, section: BudgetSection, note: string, actor: Actor) {
  return safely('send back', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    await deliver({ budgetId, engagementId: p.engagementId, companyName: p.companyName, people: p.ownersBySection[section] ?? [], title: `Budget tab sent back: ${SECTION_LABEL[section]}`, body: `${actor.name} sent back the ${SECTION_LABEL[section]} tab of the ${p.fyName} budget. Reason: ${note}`, actor });
  });
}

export function notifyPublished(budgetId: string, version: number, actor: Actor) {
  return safely('publish', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    await deliver({ budgetId, engagementId: p.engagementId, companyName: p.companyName, people: p.clients, title: `Budget ready for approval`, body: `Version ${version} of the ${p.fyName} budget for ${p.companyName} is ready for your approval.`, actor });
  });
}

export function notifyDecision(budgetId: string, approved: boolean, note: string | null, actor: Actor) {
  return safely('decision', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    await deliver({
      budgetId,
      engagementId: p.engagementId,
      companyName: p.companyName,
      people: p.staff,
      title: approved ? 'Budget approved' : 'Budget returned',
      body: `${actor.name} ${approved ? 'approved' : 'returned'} the ${p.fyName} budget for ${p.companyName}.${note ? ` Note: ${note}` : ''}`,
      actor,
    });
  });
}

export function notifySectionReminder(budgetId: string, section: BudgetSection, dueDate: string) {
  return safely('reminder', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    const owners = p.ownersBySection[section] ?? [];
    await deliver({ budgetId, engagementId: p.engagementId, companyName: p.companyName, people: owners.length ? owners : p.staff, title: `Budget tab due: ${SECTION_LABEL[section]}`, body: `The ${SECTION_LABEL[section]} tab of the ${p.fyName} budget for ${p.companyName} is due on ${dueDate} and is not done yet.` });
  });
}

export function notifyOverspend(budgetId: string, period: string, lines: { name: string; variancePct: number | null }[]) {
  return safely('overspend', async () => {
    const p = await systemBudgetParties(budgetId);
    if (!p) return;
    const list = lines.map((l) => `${l.name}${l.variancePct != null ? ` (${Math.round(l.variancePct)}% over)` : ''}`).join(', ');
    await deliver({ budgetId, engagementId: p.engagementId, companyName: p.companyName, people: [...p.staff, ...p.clients], title: 'Budget overspend', body: `With actual cost through ${period}, these lines of the ${p.fyName} budget are over their limit: ${list}.` });
  });
}
