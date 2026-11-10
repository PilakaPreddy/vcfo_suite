import 'server-only';
import { complianceGenerate } from '@/jobs/compliance-generate';
import { announcementFeeds } from '@/jobs/announcement-feeds';
import { watchCheck } from '@/jobs/watch-check';
import { watchProcess } from '@/jobs/watch-process';
import { watchDailySummary } from '@/jobs/watch-daily-summary';
import { whatsappSend } from '@/jobs/whatsapp-send';
import { askIngest } from '@/jobs/ask-ingest';
import { askDrop } from '@/jobs/ask-drop';
import { complianceReminders } from '@/jobs/compliance-reminders';
import { savedReportsSend } from '@/jobs/saved-reports-send';
import { weeklyDigest } from '@/jobs/weekly-digest';
import { kpiSnapshots } from '@/jobs/kpi-snapshots';
import { staffAlerts } from '@/jobs/staff-alerts';
import { dailyDigest } from '@/jobs/daily-digest';
import { serviceChecks } from '@/jobs/service-checks';
import { complianceTaskReminders } from '@/jobs/compliance-task-reminders';
import { complianceTaskRepeatOnComplete, complianceTaskRepeatSweep } from '@/jobs/compliance-task-repeat';
import { boardMeetingReminders } from '@/jobs/board-meeting-reminders';
import { askIndexRefresh, askIndexSweep } from '@/jobs/ask-index-refresh';
import { receivablesReminders } from '@/jobs/receivables-reminders';
import { receivablesBankFeed } from '@/jobs/receivables-bank-feed';
import { receivablesFxRates } from '@/jobs/receivables-fx-rates';
import { receivablesDigest } from '@/jobs/receivables-digest';
import { devCleanup } from '@/jobs/dev-cleanup';
import { budgetAlerts } from '@/jobs/budget-alerts';
import { requestListReminders } from '@/jobs/request-list-reminders';
import { expiryAlerts } from '@/jobs/expiry-alerts';
import { noticeEscalations } from '@/jobs/notice-escalations';
import { clientHealthNightly } from '@/jobs/client-health-nightly';
import { myDayEmail } from '@/jobs/my-day-email';
import { describeFunctions } from './parse';
import type { JobFunction } from './types';

/**
 * The Inngest functions in `src/jobs/`, described from their own config. Keep this list in
 * step with the `functions` array in `app/api/inngest/route.ts`.
 */
export function registeredJobs(): JobFunction[] {
  return describeFunctions([
    complianceGenerate,
    announcementFeeds,
    whatsappSend,
    askIngest,
    askDrop,
    askIndexRefresh,
    askIndexSweep,
    complianceReminders,
    savedReportsSend,
    weeklyDigest,
    kpiSnapshots,
    staffAlerts,
    dailyDigest,
    serviceChecks,
    devCleanup,
    complianceTaskReminders,
    complianceTaskRepeatOnComplete,
    complianceTaskRepeatSweep,
    boardMeetingReminders,
    receivablesReminders,
    receivablesBankFeed,
    receivablesFxRates,
    receivablesDigest,
    budgetAlerts,
    watchCheck,
    watchProcess,
    watchDailySummary,
    requestListReminders,
    expiryAlerts,
    noticeEscalations,
    clientHealthNightly,
    myDayEmail,
  ]);
}
