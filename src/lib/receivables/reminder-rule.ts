import { addDaysIso, daysLeft, isWeekendIso, sheetDate } from './dates';
import type { Partner, ReminderKind, ReminderRules, SheetInvoice } from './model';

/**
 * RECEIVABLES REMINDER RULE (docs/specs/receivables/PLAN.md, owner decision 3 Nov 2026).
 *
 * An open invoice gets a reminder to its client partner on the rule's days before the due date
 * (5 and 3 by default), on the due date, and then every day after it until it is marked received.
 * A paused invoice gets nothing up to and including its pause date. Weekends are skipped when the
 * rule says so. The job builds the queue from `reminderOn` at 08:00 IST and sends at 09:00.
 */

export type ReminderHit = { kind: ReminderKind; daysLeft: number; label: string };

type RuleInvoice = Pick<SheetInvoice, 'status' | 'dueDate' | 'remindersPausedUntil'>;

export function reminderOn(inv: RuleInvoice, iso: string, rules: ReminderRules): ReminderHit | null {
  if (inv.status !== 'open') return null;
  if (inv.remindersPausedUntil && iso <= inv.remindersPausedUntil) return null;
  if (rules.skipWeekends && isWeekendIso(iso)) return null;
  const dl = daysLeft(inv.dueDate, iso);
  if (dl > 0 && rules.daysBefore.includes(dl)) return { kind: 'before', daysLeft: dl, label: `${dl} days before due` };
  if (dl === 0 && rules.onDueDate) return { kind: 'due', daysLeft: 0, label: 'Due today' };
  if (dl < 0 && rules.dailyAfterDue) return { kind: 'overdue', daysLeft: dl, label: `${-dl} day${dl === -1 ? '' : 's'} overdue` };
  return null;
}

/**
 * The next IST day a reminder would go, from `today` on. `afterToday` skips today, for an invoice
 * whose reminder today was already sent or skipped. Null when no reminder falls in the next
 * 120 days (received, or a rule with nothing after due).
 */
export function nextReminderDate(inv: RuleInvoice, today: string, rules: ReminderRules, afterToday = false): string | null {
  for (let n = afterToday ? 1 : 0; n <= 120; n++) {
    const iso = addDaysIso(today, n);
    if (reminderOn(inv, iso, rules)) return iso;
  }
  return null;
}

/** Every invoice that is due a reminder on `today`, with what kind. */
export function reminderQueue<T extends RuleInvoice>(invoices: T[], today: string, rules: ReminderRules): Array<{ invoice: T; hit: ReminderHit }> {
  const out: Array<{ invoice: T; hit: ReminderHit }> = [];
  for (const invoice of invoices) {
    const hit = reminderOn(invoice, today, rules);
    if (hit) out.push({ invoice, hit });
  }
  return out;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** The default reminder email to a client partner. The manager may override it for one day. */
export function reminderDraft(
  inv: Pick<SheetInvoice, 'clientName' | 'invoiceNo' | 'amountInr' | 'dueDate'>,
  hit: ReminderHit,
  partner: Pick<Partner, 'name'>,
  opts: { liveUrl: string; signerName: string },
): { subject: string; text: string } {
  const first = partner.name.trim().split(/\s+/)[0] || 'there';
  const ref = [inv.clientName, inv.invoiceNo ? `invoice ${inv.invoiceNo}` : 'invoice'].join(' ');
  const amount = `₹${inr.format(Math.round(inv.amountInr))}`;
  let line: string;
  if (hit.kind === 'due') line = `${ref} for ${amount} is due today (${sheetDate(inv.dueDate)}).`;
  else if (hit.kind === 'overdue') line = `${ref} for ${amount} was due on ${sheetDate(inv.dueDate)} and is now ${hit.label}. Please follow up with the client.`;
  else line = `${ref} for ${amount} falls due on ${sheetDate(inv.dueDate)}, ${hit.daysLeft} days from today.`;
  return {
    subject: `Reminder: ${ref} · ${hit.label}`,
    text: `Hi ${first},\n\n${line}\n\nThe live receivables page: ${opts.liveUrl}\n\nRegards,\n${opts.signerName}\nSBC`,
  };
}

/** The hit a stored reminder row stands for (its kind and days left on its day). */
export function hitFromRow(row: { kind: string; daysLeft: number }): ReminderHit {
  if (row.kind === 'due') return { kind: 'due', daysLeft: 0, label: 'Due today' };
  if (row.kind === 'overdue') return { kind: 'overdue', daysLeft: row.daysLeft, label: `${-row.daysLeft} day${row.daysLeft === -1 ? '' : 's'} overdue` };
  return { kind: 'before', daysLeft: row.daysLeft, label: `${row.daysLeft} days before due` };
}
