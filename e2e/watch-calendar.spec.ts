import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers/login';

/**
 * A due-date update from a pasted official email to a moved calendar: the pipeline reads it with the
 * real model, a reviewer publishes it, and a manager decides the change card in the browser. It needs
 * `ANTHROPIC_API_KEY`, `WATCH_ENABLED` and demo data with Form MGT-7 FY 2025-26 on the calendar, and
 * skips when the model does not answer. Each run moves the date on one day, so it can run again.
 */
const PERIOD = 'Form MGT-7 FY 2025-26';
const STATUTORY_DATE = '2026-11-29';
const FIRST_NEW_DATE = '2026-12-31';

type Change = { obligationId: string; period: string; oldDueDate: string; newDueDate: string };
type Proposal = { id: string; updateTitle: string; status: string; oldDueDate: string; newDueDate: string; total: number };

const appliedChanges = async (page: Page): Promise<Change[]> =>
  (await (await page.request.get('/api/watch/proposals?applied=1')).json()).changes.filter((change: Change) => change.period === PERIOD);

const proposalFor = async (page: Page, title: string): Promise<Proposal | undefined> =>
  (await (await page.request.get('/api/watch/proposals')).json()).proposals.find((proposal: Proposal) => proposal.updateTitle === title);

function nextDay(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

const spelled = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function officialMail(subject: string, oldDate: string, newDate: string): string {
  return [
    'From: MCA Alerts <alerts@mca.gov.in>',
    'Sent: 6 November 2026 10:00',
    `Subject: ${subject}`,
    '',
    `General Circular on the time for filing annual returns, reference ${subject}.`,
    `The Ministry of Corporate Affairs has decided to extend the due date for filing Form MGT-7 for FY 2025-26 under the Companies Act, 2013 from ${spelled(oldDate)} to ${spelled(newDate)}. No additional fees are payable up to the extended date. All other provisions stay unchanged.`,
  ].join('\n');
}

async function pasteMail(page: Page, mail: string) {
  await page.goto('/app/admin/watch');
  await page.getByRole('button', { name: 'Add update' }).click();
  await page.getByLabel(/paste an official email/).fill(mail);
  await page.getByRole('dialog').getByRole('button', { name: 'Add update' }).click();
  // Without an Inngest server the send retries for a few seconds, then the document is read inline.
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });
}

/** The queue rereads itself while a document is in progress. The model answers within a minute. */
async function openWhenRead(page: Page, title: string): Promise<boolean> {
  const row = page.getByRole('button', { name: new RegExp(`(Not yet reviewed|Needs attention).*${title}`) });
  const read = await row.waitFor({ timeout: 90_000 }).then(() => true, () => false);
  if (read) await row.click();
  return read;
}

/** Publishes the update with the old and new dates this run set, whatever the model read. */
async function publishWithDates(page: Page, oldDate: string, newDate: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Old due date').fill(oldDate);
  await dialog.getByLabel('New due date').fill(newDate);
  await dialog.getByLabel('Change', { exact: true }).selectOption('due_date');
  const accept = dialog.getByLabel(/I read the source and accept/);
  if (await accept.isVisible()) await accept.check();
  await dialog.getByRole('button', { name: 'Save edits' }).click();
  await expect(dialog.getByText(/Moves \d+ clients?/)).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Clients this touches' }).getByText(/MGT-7.* open$/).first()).toBeVisible();
  await expect(dialog.getByText('Proposed on publish')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('calendar change proposals', () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    for (const kind of ['announcement', 'notification']) {
      await page.addLocatorHandler(page.locator(`#${kind}-live-title`), () => page.keyboard.press('Escape'), { noWaitAfter: true });
    }
  });

  test('a rejected proposal changes nothing and an approved one moves the date', async ({ page, browser }) => {
    const run = Date.now();
    await login(page, 'admin');
    const before = await appliedChanges(page);
    const oldDate = before.at(-1)?.newDueDate ?? STATUTORY_DATE;
    const newDate = before.length > 0 ? nextDay(oldDate) : FIRST_NEW_DATE;

    // First the rejection, so the same dates are still open for the approval after it.
    const rejectTitle = `MGT-7 time extended ${run} A`;
    await pasteMail(page, officialMail(rejectTitle, oldDate, newDate));
    const read = await openWhenRead(page, rejectTitle);
    test.skip(!read, 'The model did not read the email in time.');
    await publishWithDates(page, oldDate, newDate);

    const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const manager = await managerContext.newPage();
    await manager.addLocatorHandler(manager.locator('#announcement-live-title'), () => manager.keyboard.press('Escape'), { noWaitAfter: true });
    await manager.addLocatorHandler(manager.locator('#notification-live-title'), () => manager.keyboard.press('Escape'), { noWaitAfter: true });
    await login(manager, 'manager');
    await manager.goto('/app/manager/watch');
    const rejectCard = manager.getByRole('listitem').filter({ hasText: rejectTitle });
    await expect(rejectCard.getByText('Waiting for approval')).toBeVisible();
    await rejectCard.getByRole('button', { name: 'Reject' }).click();
    await expect(rejectCard.getByText('Rejected')).toBeVisible();
    expect(await appliedChanges(manager)).toEqual(before);

    // A second answer to a decided card is refused, and the date still has not moved.
    const rejected = (await proposalFor(manager, rejectTitle))!;
    const again = await manager.request.post(`/api/watch/proposals/${rejected.id}`, { data: { decision: 'approved' } });
    expect(again.status()).toBe(409);
    expect(await appliedChanges(manager)).toEqual(before);

    const approveTitle = `MGT-7 time extended ${run} B`;
    await pasteMail(page, officialMail(approveTitle, oldDate, newDate));
    expect(await openWhenRead(page, approveTitle)).toBe(true);
    await publishWithDates(page, oldDate, newDate);

    await manager.reload();
    const card = manager.getByRole('listitem').filter({ hasText: approveTitle });
    await expect(card.getByText('Waiting for approval')).toBeVisible();
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(card.getByText('Approved')).toBeVisible();
    await expect(card.getByText(/Moved \d+ clients?/)).toBeVisible();
    const after = await appliedChanges(manager);
    expect(after.at(-1)).toMatchObject({ obligationId: 'mca-mgt-7', period: PERIOD, oldDueDate: oldDate, newDueDate: newDate });
    await managerContext.close();
  });

  test('a project lead reads a card and has no buttons on it', async ({ page }) => {
    await login(page, 'lead');
    await page.goto('/app/intern/watch');
    await expect(page.getByText('Review queue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    const refused = await page.request.post('/api/watch/proposals/00000000-0000-0000-0000-000000000001', { data: { decision: 'approved' } });
    expect(refused.status()).toBe(403);
  });

  test('the mailbox endpoint stays off without its settings', async ({ request }) => {
    const res = await request.post('/api/watch/mail', { data: 'From: a@mca.gov.in', headers: { authorization: 'Bearer wrong' } });
    expect([401, 404]).toContain(res.status());
  });
});
