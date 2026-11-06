import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, onLocalDb, openAsk } from './helpers/login';

/**
 * The data router as a project lead: drop a synthetic document, review the card, accept, see the
 * value on the step, undo. The form is read by code, so no model runs. Needs S3 or MinIO, and a demo
 * database. The test opens "Proposed directors" on Kestrel and puts the demo state back afterwards.
 */

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const SLUG = 'demo-kestrel-robotics';
const STEP_PATH = `/app/intern/engagements/${SLUG}/step/proposed-directors`;
const FIXTURES = path.resolve('tests/ask/evals/fill/fixtures');

let saved: unknown = null;

test.beforeAll(async () => {
  await onLocalDb(async (db) => {
    const { rows } = await db.query('select checklist_state from engagements where slug = $1', [SLUG]);
    saved = rows[0].checklist_state;
    await db.query(`update engagements set checklist_state = checklist_state - 'pre-15' where slug = $1`, [SLUG]);
  });
});

test.afterAll(async () => {
  await onLocalDb((db) => db.query('update engagements set checklist_state = $2 where slug = $1', [SLUG, JSON.stringify(saved)]));
});

const preFifteen = async () => {
  let responses: Record<string, string> = {};
  await onLocalDb(async (db) => {
    const { rows } = await db.query(`select checklist_state->'pre-15'->'responses' as responses from engagements where slug = $1`, [SLUG]);
    responses = rows[0].responses ?? {};
  });
  return responses;
};

async function send(root: Locator) {
  const send = root.getByRole('button', { name: 'Send' });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
}

/** The composer ignores typing until it has hydrated, so type until Send wakes up, then send once. */
async function typeUntilReady(composer: Locator, root: Locator, text: string) {
  const button = root.getByRole('button', { name: 'Send' }).first();
  await expect(async () => {
    await composer.fill(text);
    await expect(button).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await button.click();
}

async function openPanelOnStep(page: Page): Promise<Locator> {
  await login(page, 'lead');
  await page.goto(STEP_PATH);
  await page.waitForLoadState('domcontentloaded');
  return openAsk(page);
}

test('a dropped document becomes a card, saves on accept and comes back off on undo', async ({ page }) => {
  const panel = await openPanelOnStep(page);
  await panel.getByTestId('ask-attach-input').setInputFiles(path.join(FIXTURES, 'e2e-director.pdf'));
  await expect(panel.getByText('e2e-director.pdf')).toBeVisible({ timeout: 30_000 });
  await send(panel);

  const card = panel.locator('section[aria-label^="Details for"]');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(panel.getByText(/Nothing is saved until you accept/)).toBeVisible();
  const rows = card.getByTestId('changeset-row');
  await expect(rows.first()).toBeVisible();

  // Identity numbers are masked on the card and in the page, and nothing has been saved yet.
  await expect(card).toContainText('XXXXXX234F');
  await expect(panel).not.toContainText('ABCPR1234F');
  await expect(card).toContainText('e2e-director.pdf');
  expect(await preFifteen()).toEqual({});

  // Edit one row: the card changes and the step still does not.
  const din = rows.filter({ hasText: 'Director DIN' });
  await din.getByRole('button', { name: 'Edit' }).click();
  await din.getByRole('textbox').fill('07654321');
  await din.getByRole('button', { name: 'Use this' }).click();
  await expect(din).toContainText('XXXX4321', { timeout: 60_000 });
  expect(await preFifteen()).toEqual({});

  await card.getByRole('button', { name: 'Accept all clear rows' }).click();
  await card.getByRole('button', { name: /^Save accepted/ }).click();
  await expect(card.getByRole('button', { name: 'Undo' })).toBeVisible({ timeout: 60_000 });
  await expect(rows.filter({ hasText: 'Director first name' })).toContainText('Saved');

  const after = await preFifteen();
  const [entry] = (after.directors ?? '').split(',');
  expect(entry).toBeTruthy();
  expect(after[`directors.${entry}.firstName`]).toBe('Asha');
  expect(after[`directors.${entry}.din`]).toBe('07654321');
  expect(after[`directors.${entry}.dob`]).toBe('1985-04-03');

  // The same value on the step, as the screen shows it.
  await page.goto(STEP_PATH);
  await expect(page.locator('input[value="Asha"]').first()).toBeAttached({ timeout: 60_000 });

  // Undo from the card: the panel stays open across the page change and loads the chat again.
  const again = page.locator('#ask-panel');
  const reopened = again.locator('section[aria-label^="Details for"]').first();
  await expect(reopened).toBeVisible({ timeout: 60_000 });
  await reopened.getByRole('button', { name: 'Undo' }).click();
  await expect(reopened.getByTestId('changeset-row').filter({ hasText: 'Director first name' })).toContainText('Undone', { timeout: 60_000 });
  const undone = await preFifteen();
  expect(undone.directors ?? '').toBe('');
  expect(undone[`directors.${entry}.firstName`] ?? '').toBe('');
});

test('a document naming another client is a question, and no card appears', async ({ page }) => {
  const panel = await openPanelOnStep(page);
  await panel.getByTestId('ask-attach-input').setInputFiles(path.join(FIXTURES, 'wrong-company.pdf'));
  await expect(panel.getByText('wrong-company.pdf')).toBeVisible({ timeout: 30_000 });
  await send(panel);
  await expect(panel.getByText(/This document names Zeta Industries Limited/)).toBeVisible({ timeout: 90_000 });
  await expect(panel.locator('article').last()).not.toContainText('JKLPD3456M');
  await expect(panel.locator('section[aria-label^="Details for"]')).toHaveCount(0);
});

test('a labelled paste makes a card and shows masked text in the chat', async ({ page }) => {
  const panel = await openPanelOnStep(page);
  const composer = panel.locator('#ask-composer');
  await typeUntilReady(composer, panel, 'Name: Ravi Menon\nPAN: DEFPM5678K\nDIN: 07654321');
  const card = panel.locator('section[aria-label^="Details for"]').last();
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(panel).not.toContainText('DEFPM5678K');
  await expect(card).toContainText('Pasted text');
  await card.getByRole('button', { name: 'Discard' }).click();
  await expect(card).toContainText('Discarded');
});

test('the full page takes a paste too, and the card fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page, 'lead');
  await page.goto('/app/intern/ask');
  await typeUntilReady(page.locator('#ask-composer').first(), page.locator('body'), 'For Kestrel Robotics\nName: Ravi Menon\nPAN: DEFPM5678K\nDIN: 07654321');
  const card = page.locator('section[aria-label^="Details for"]').last();
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toContainText('Pasted text');
  await expect(page.locator('body')).not.toContainText('DEFPM5678K');
  const box = await card.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await card.getByRole('button', { name: 'Discard' }).click();
  await expect(card).toContainText('Discarded');
});

test('a manager opens a card only when it holds a row for the manager', async ({ page }) => {
  let id = '';
  await onLocalDb(async (db) => {
    const { rows } = await db.query(
      `select c.id from ask_changesets c join engagements e on e.id = c.engagement_id where e.slug = $1 order by c.created_at desc limit 1`,
      [SLUG],
    );
    id = rows[0].id;
  });
  await login(page, 'manager');
  await page.goto(`/app/manager/ask?changeset=${id}`);
  await expect(page.getByText('This card is not available.')).toBeVisible({ timeout: 60_000 });

  // The same link once a row needs the manager, as a row on the approval step does.
  await onLocalDb((db) =>
    db.query(`update ask_changeset_rows set target = target || '{"needsManager": true}' where changeset_id = $1 and ordinal = 0`, [id]),
  );
  await page.reload();
  await expect(page.locator('section[aria-label^="Details for"]').first()).toBeVisible({ timeout: 60_000 });
});
