import { expect, test, type Page } from '@playwright/test';
import { login, type DemoRole } from './helpers/login';

/**
 * Official updates, end to end: a reviewer publishes an important update from the queue and every
 * role gets a bell row for it. The queue is filled by the Watch pipeline, so the test needs at least
 * one update waiting (`Not yet reviewed`) and skips when there is none.
 */
const ROLES: DemoRole[] = ['super', 'admin', 'manager', 'lead', 'client'];

const boardTitles = (page: Page): Promise<Array<{ title: string; unreviewed?: boolean }>> =>
  page.request.get('/api/announcements').then(async (res) => (await res.json()).announcements);

const bellTitles = (page: Page): Promise<string[]> =>
  page.request.get('/api/notifications').then(async (res) => (await res.json()).notifications.map((row: { title: string }) => row.title));

/** A well-formed id is enough: the role check answers before the update is looked up. */
const ANY_ID = '00000000-0000-0000-0000-000000000001';

test.describe.serial('official updates', () => {
  let title = '';

  // New items pop up for staff; a person closes those cards, so the test does too.
  test.beforeEach(async ({ page }) => {
    for (const kind of ['announcement', 'notification']) {
      // The next card in the queue can follow at once, so the handler does not wait for this one to go.
      await page.addLocatorHandler(page.locator(`#${kind}-live-title`), () => page.keyboard.press('Escape'), { noWaitAfter: true });
    }
  });

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
    await page.context().clearCookies();
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
      await page.context().clearCookies();
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
    await page.context().clearCookies();
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
