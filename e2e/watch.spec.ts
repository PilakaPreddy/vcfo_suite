import { expect, test, type Page } from '@playwright/test';
import { askClientChat, login, onLocalDb, openAsk, openClientChat, type DemoRole } from './helpers/login';

/**
 * Official updates, end to end: a reviewer publishes an important update from the queue and every
 * role gets a bell row for it. A run uses up two waiting updates, so on a local database it tops the
 * queue up here, with no model. On any other database the tests skip when nothing is waiting.
 */
const ROLES: DemoRole[] = ['super', 'admin', 'manager', 'lead', 'client'];

const QUOTE = 'The due date for filing the return is extended to 31 March 2027.';

async function topUpQueue(): Promise<void> {
  await onLocalDb(async (db) => {
    const { rows } = await db.query(`select count(*)::int as waiting from reg_updates where status = 'unreviewed'`);
    for (let n = rows[0].waiting; n < 2; n += 1) {
      const title = `Test update ${Date.now()}-${n}: return due date extended`;
      const { rows: [update] } = await db.query(
        `insert into reg_updates (title, intake, status, area, change_type, importance, summary, quote, source_text, published_on)
         values ($1, 'manual', 'unreviewed', 'gst', 'circular', 'normal', $2, $2, $2, current_date) returning id`,
        [title, QUOTE],
      );
      const { rows: [board] } = await db.query(
        `insert into announcements (title, body, kind, origin, external_id, audience, unreviewed, author_name)
         values ($1, $2, 'gst', 'feed', $3, 'staff', true, 'Official update') returning id`,
        [title, QUOTE, `reg:${update.id}`],
      );
      await db.query(`update reg_updates set announcement_id = $1 where id = $2`, [board.id, update.id]);
    }
  });
}

const boardTitles = (page: Page): Promise<Array<{ title: string; unreviewed?: boolean }>> =>
  page.request.get('/api/announcements').then(async (res) => (await res.json()).announcements);

const bellTitles = (page: Page): Promise<string[]> =>
  page.request.get('/api/notifications').then(async (res) => (await res.json()).notifications.map((row: { title: string }) => row.title));

/** A well-formed id is enough: the role check answers before the update is looked up. */
const ANY_ID = '00000000-0000-0000-0000-000000000001';

test.describe.serial('official updates', () => {
  let title = '';

  test.beforeAll(topUpQueue);

  test('a reviewer sees the queue and the health of every source', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/app/admin/watch');
    await expect(page.getByText('Review queue')).toBeVisible();
    await expect(page.getByText('Official sources')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Official updates' })).toBeVisible();
    await expect(page.getByText('Added by hand').first()).toBeVisible();
    await expect(page.getByText('Not read automatically').first()).toBeVisible();
  });

  test('an unreviewed update is marked for staff and hidden from clients', async ({ page }) => {
    await login(page, 'lead');
    const unreviewed = (await boardTitles(page)).filter((row) => row.unreviewed);
    test.skip(unreviewed.length === 0, 'No update is waiting for review.');
    await page.goto('/app/intern/announcements');
    await expect(page.getByText('Not yet reviewed').first()).toBeVisible();
    await page.goto('/app/intern/watch');
    await page.getByRole('button', { name: /Not yet reviewed/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    const asLead = await page.request.post(`/api/watch/updates/${ANY_ID}`, { data: { action: 'publish' } });
    expect(asLead.status()).toBe(403);

    const titles = unreviewed.map((row) => row.title);
    await login(page, 'client');
    const seen = (await boardTitles(page)).map((row) => row.title);
    expect(seen.filter((seenTitle) => titles.includes(seenTitle))).toEqual([]);
    expect((await page.request.get('/api/watch/updates')).status()).toBe(403);
  });

  test('publishing an important update reaches a bell row for every role', async ({ page }) => {
    test.slow();
    await login(page, 'manager');
    await page.goto('/app/manager/watch');
    await expect(page.getByText('Review queue')).toBeVisible();
    const row = page.getByRole('button', { name: /Not yet reviewed/ }).first();
    await row.waitFor({ timeout: 15_000 }).catch(() => undefined);
    test.skip((await row.count()) === 0, 'No update is waiting for review.');
    await row.click();
    await page.getByLabel('Who is told').selectOption('important');
    title = await page.getByRole('dialog').getByRole('heading').first().innerText();
    await page.getByRole('button', { name: 'Save edits' }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published').first()).toBeVisible();

    for (const role of ROLES) {
      await login(page, role);
      expect(await bellTitles(page), `bell row for ${role}`).toContain(title.slice(0, 160));
      const board = await boardTitles(page);
      expect(board.find((item) => item.title === title)?.unreviewed, `board row for ${role}`).toBe(false);
      // The row is on screen: staff open the bell, and the client's bell opens its notifications page.
      await page.keyboard.press('Escape');
      await page.locator(role === 'client' ? 'button[aria-label^="Notifications"]' : '[data-notifications-bell]').first().click();
      await expect(page.getByText(title.slice(0, 40)).first()).toBeVisible();
      if (role === 'client') await expect(page.locator('.nkind', { hasText: 'Announcement' }).first()).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`bell-${role}.png`) });
    }
  });

  test('the chat lists the published update with no model call', async ({ page }) => {
    test.skip(!title, 'No update was published.');
    await login(page, 'client');
    const chat = await openClientChat(page);
    await askClientChat(chat, 'What changed this week?');
    await expect(chat.getByText(title.slice(0, 40)).first()).toBeVisible({ timeout: 60_000 });
    await login(page, 'lead');
    const panel = await openAsk(page);
    await panel.locator('#ask-composer').fill('What changed in GST this week?');
    await panel.getByRole('button', { name: 'Send' }).click();
    const answer = panel.locator('article').last();
    await expect(answer).toContainText('in the last 7 days', { timeout: 60_000 });
    await expect(answer).toContainText(title.slice(0, 40));
    await expect(answer.getByRole('link', { name: 'Open updates' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('chat-update.png') });
  });

  test('a rejected update needs a reason and never reaches a client', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/app/admin/watch');
    await expect(page.getByText('Review queue')).toBeVisible();
    const row = page.getByRole('button', { name: /Needs attention|Not yet reviewed/ }).first();
    await row.waitFor({ timeout: 15_000 }).catch(() => undefined);
    test.skip((await row.count()) === 0, 'No update is waiting for review.');
    await row.click();
    const rejected = await page.getByRole('dialog').getByRole('heading').first().innerText();
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Reject' })).toBeDisabled();
    await page.getByLabel('Why it is rejected').fill('A duplicate of another update.');
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Rejected').first()).toBeVisible();
    await login(page, 'client');
    expect((await boardTitles(page)).map((item) => item.title)).not.toContain(rejected);
  });

  test('a phone shows the queue with no sideways scroll @mobile', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/app/admin/watch');
    await expect(page.getByText('Review queue')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // A source's name keeps its own line, so it is never squeezed down to a letter or two.
    const source = page.getByRole('link', { name: 'CGST notifications' });
    await source.scrollIntoViewIfNeeded();
    expect((await source.boundingBox())!.height).toBeLessThan(40);
    expect((await source.evaluate((link) => link.scrollWidth <= link.clientWidth))).toBe(true);
    await page.screenshot({ path: test.info().outputPath('watch-phone.png'), fullPage: true });
  });
});
