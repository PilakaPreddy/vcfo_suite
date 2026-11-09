/**
 * Runs the compliance reminder job's steps (src/jobs/compliance-task-reminders.ts) for one date,
 * without Inngest, for the acceptance run. Quiet hours are not waited for. Run with the mail catcher:
 *   RESEND_API_KEY=re_uat_catcher node --conditions=react-server --import tsx \
 *     --import ./e2e/uat/tools/mail-catcher.mjs e2e/uat/tools/run-reminders.ts 2026-11-10
 */
import {
  systemDeliverComplianceBells,
  systemMarkReminderEmailed,
  systemPlanComplianceReminders,
} from '@/db/repositories/compliance-reminder-schedule';
import { buildComplianceReminderEmail } from '@/lib/compliance-tasks/reminder-email';
import { sendEmail } from '@/lib/email/send-email';

async function main() {
  const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const plan = await systemPlanComplianceReminders(today);
  const emails = plan.length ? await systemDeliverComplianceBells(today, plan) : [];
  let sent = 0;
  for (const person of emails) {
    const copy = buildComplianceReminderEmail({ recipientName: person.name, lines: person.lines });
    const res = await sendEmail({ to: person.email, subject: copy.subject, html: copy.html, text: copy.text, purpose: 'compliance.reminder' });
    if (res.ok || res.skipped) {
      await systemMarkReminderEmailed(person.logIds);
      sent += 1;
    }
  }
  console.log(JSON.stringify({ today, reminders: plan.length, people: emails.length, emails: sent, to: emails.map((e) => `${e.email}:${e.lines.length}`) }));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
