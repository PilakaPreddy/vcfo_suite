import { inngest } from './client';
import { systemDraftsToPrepare, systemMarkHeld, systemMeetingBundle, systemMeetingPeople, systemMomOpen } from '@/db/repositories/board-meetings';
import { prepareDate, todayIst } from '@/lib/board-meetings/dates';
import { remindLead } from '@/lib/board-meetings/send';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Board meetings, daily 08:20 India time (docs/specs/board-meetings/PLAN.md):
 *  1. A sent meeting whose date has passed becomes held (its task moves to "Upload MoM").
 *  2. T-10, T-8 and T-7: a notice still in draft → bell + email to the lead.
 *  3. MoM not locked: reminders at T+7, T+20 and T+28, then weekly once overdue (SS-1, 30 days).
 * Email is the system of record; the bell row rides along. Returns early while "Pause all jobs"
 * is on. Registered in app/api/inngest/route.ts.
 */
const PREPARE_OFFSETS = new Set([0, 2, 3]); // days after T-10
const MOM_DAYS = new Set([7, 20, 28]);

export const boardMeetingReminders = inngest.createFunction(
  { id: 'board-meeting-reminders' },
  withRunNow('board-meeting-reminders', 'TZ=Asia/Kolkata 20 8 * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIst();
    const held = await step.run('mark-held', () => systemMarkHeld(today));
    const prepared = await step.run('prepare-notice', async () => {
      let n = 0;
      for (const m of await systemDraftsToPrepare(today)) {
        const offset = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${prepareDate(m.meetingDate)}T00:00:00Z`)) / 86_400_000);
        if (!PREPARE_OFFSETS.has(offset)) continue;
        const bundle = await systemMeetingBundle(m.id);
        const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
        if (!team?.lead) continue;
        await remindLead({ meetingId: m.id, lead: team.lead, kind: 'prepare' });
        n += 1;
      }
      return n;
    });
    const mom = await step.run('mom-due', async () => {
      let n = 0;
      for (const { meeting, daysAfter } of await systemMomOpen(today)) {
        if (!MOM_DAYS.has(daysAfter) && !(daysAfter > 30 && (daysAfter - 30) % 7 === 0)) continue;
        const bundle = await systemMeetingBundle(meeting.id);
        const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
        if (!team?.lead) continue;
        await remindLead({ meetingId: meeting.id, lead: team.lead, kind: 'mom', daysAfter });
        n += 1;
      }
      return n;
    });
    return { held, prepared, mom };
  },
);
