import { inngest } from './client';
import { systemFindOverspends, systemListSectionsToRemind, systemMarkAlertRun, systemMarkSectionReminded } from '@/db/repositories/budgets';
import { notifyOverspend, notifySectionReminder } from '@/lib/budget/notify';
import type { BudgetSection } from '@/lib/budget/model';
import { todayIso } from '@/lib/client-portal/compliances';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

const DAY_MS = 86_400_000;

/**
 * Scheduled, daily 07:30: reminds owners of tabs due within two days or overdue, at most once every
 * three days per tab, and sends one overspend alert for each new month of actual cost. Email is the
 * record, through `deliver` in `lib/budget/notify.ts`; WhatsApp is not used here.
 */
export const budgetAlerts = inngest.createFunction(
  { id: 'budget-alerts' },
  withRunNow('budget-alerts', '30 7 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIso();
    const through = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * DAY_MS).toISOString().slice(0, 10);
    const due = await step.run('load-due-tabs', async () => systemListSectionsToRemind(through, new Date(Date.now() - 3 * DAY_MS)));
    for (const tab of due) {
      await step.run(`remind-${tab.budgetId}-${tab.section}`, async () => {
        await notifySectionReminder(tab.budgetId, tab.section as BudgetSection, tab.dueDate ?? '');
        await systemMarkSectionReminded(tab.budgetId, tab.section);
      });
    }
    const overspends = await step.run('find-overspends', async () => systemFindOverspends());
    for (const alert of overspends) {
      await step.run(`overspend-${alert.budgetId}-${alert.period}`, async () => {
        await notifyOverspend(alert.budgetId, alert.period, alert.lines.map((l) => ({ name: l.name ?? '', variancePct: l.variancePct ?? null })));
        await systemMarkAlertRun(alert.budgetId, alert.period);
      });
    }
    return { reminded: due.length, overspends: overspends.length };
  },
);
