import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, onLocalDb, openAsk } from './helpers/login';

/**
 * The data router as a project lead: drop a synthetic document, review the card, accept, see the
 * value on the step, undo. The form is read by code, so no model runs. Needs S3 or MinIO, and a demo
 * database. The test opens "Proposed directors" on Kestrel and puts the demo state back afterwards.
 *
 * The last test drops a whole folder for two of the lead's clients and follows the drop job: its
 * progress, the panel closed and opened again, one card per client, the labour register group
 * accepted, the file in the register's slot, and undo. Every file in it is read by code, so no model
 * runs either.
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
  await expect(panel).not.toContainText('Reviewed by');
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

// ---- A dropped folder for two clients -------------------------------------------------------------

const SECOND_SLUG = 'demo-solstice-energy';
const KESTREL = 'Kestrel Robotics India Pvt Ltd';
const SOLSTICE = 'Solstice Energy India Pvt Ltd';

/** The uploads in one client's register slot for August 2026, newest first. */
async function registerSlot(slug: string, stateCode: string, slot: string) {
  let found: Array<{ batchId: string; fileName: string }> = [];
  await onLocalDb(async (db) => {
    const { rows } = await db.query(
      `select b.id as "batchId", u.file_name as "fileName"
         from labour_register_uploads u
         join labour_register_batches b on b.id = u.batch_id
         join engagements e on e.id = b.engagement_id
        where e.slug = $1 and b.state_code = $2 and b.period_from = '2026-08-01' and u.slot = $3
        order by u.created_at desc`,
      [slug, stateCode, slot],
    );
    found = rows;
  });
  return found;
}

/**
 * The folder as a person would keep it: one folder per client, the state and the month below it.
 * Kestrel also gets the director form, so its card has a values section beside the labour register.
 */
function makeDropFolder(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ask-drop-'));
  const folder = path.join(root, 'August payroll');
  const put = (fixture: string, ...parts: string[]) => {
    const dir = path.join(folder, ...parts.slice(0, -1));
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(FIXTURES, fixture), path.join(dir, parts.at(-1)!));
  };
  put('drop-paysheet.xlsx', 'Kestrel Robotics', 'Karnataka', 'Aug-2026', 'paysheet.xlsx');
  put('drop-attendance.xlsx', 'Kestrel Robotics', 'Karnataka', 'Aug-2026', 'attendance.xlsx');
  put('e2e-director.pdf', 'Kestrel Robotics', 'KYC', 'director form.pdf');
  put('drop-paysheet.xlsx', 'Solstice Energy', 'Telangana', 'Aug-2026', 'paysheet.xlsx');
  return folder;
}

test.describe('a dropped folder for two clients', () => {
  let folder = '';
  let batchesBefore: string[] = [];

  test.beforeAll(async () => {
    folder = makeDropFolder();
    await onLocalDb(async (db) => {
      const { rows } = await db.query(
        `select b.id from labour_register_batches b join engagements e on e.id = b.engagement_id where e.slug = any($1::text[]) and b.period_from = '2026-08-01'`,
        [[SLUG, SECOND_SLUG]],
      );
      batchesBefore = rows.map((r: { id: string }) => r.id);
    });
  });

  test.afterAll(async () => {
    if (folder) rmSync(path.dirname(folder), { recursive: true, force: true });
    // The drop opened August batches that were not there before; the demo data goes back as it was.
    await onLocalDb((db) =>
      db.query(
        `delete from labour_register_batches b using engagements e
          where e.id = b.engagement_id and e.slug = any($1::text[]) and b.period_from = '2026-08-01' and not (b.id = any($2::uuid[]))`,
        [[SLUG, SECOND_SLUG], batchesBefore],
      ),
    );
  });

  test('shows progress, comes back after the panel is closed, and files the labour group with undo', async ({ page }) => {
    await login(page, 'lead');
    await page.goto('/app/intern');
    let panel = await openAsk(page);

    // 1. Drop the folder and ask for it to be filled in.
    await panel.getByTestId('ask-folder-input').setInputFiles(folder);
    await expect(panel.getByText('paysheet.xlsx').first()).toBeVisible({ timeout: 30_000 });
    await typeUntilReady(panel.locator('#ask-composer'), panel, 'Fill this in');

    // 2. The job's progress shows while the files are read and sorted.
    await expect(panel.getByTestId('ask-drop-progress')).toBeVisible({ timeout: 60_000 });

    // 3. Close the panel and open it again: the drop carries on and the chat picks it back up.
    await panel.getByRole('button', { name: 'Close Ask VCFO' }).first().click();
    await expect(panel).toBeHidden();
    panel = await openAsk(page);

    // 4. One card per client.
    const kestrel = panel.locator(`section[aria-label^="${KESTREL}:"]`);
    const solstice = panel.locator(`section[aria-label^="${SOLSTICE}:"]`);
    await expect(kestrel).toBeVisible({ timeout: 180_000 });
    await expect(solstice).toBeVisible({ timeout: 60_000 });
    await expect(kestrel).toHaveAttribute('aria-label', /: 2 files, \d+ values?$/);
    await expect(solstice).toHaveAttribute('aria-label', `${SOLSTICE}: 1 file, 0 values`);
    await expect(panel).not.toContainText('ABCPR1234F');
    expect(await registerSlot(SLUG, 'KA', 'paysheet')).toEqual([]);

    // 5. Accept only the labour register section of Kestrel's card, then save.
    const labour = kestrel.locator('section[data-testid="changeset-group"][aria-label^="Labour register"]');
    await expect(labour).toHaveAttribute('aria-label', 'Labour register · Karnataka · Aug 2026');
    await labour.getByRole('button', { name: /^Accept all clear in Labour register/ }).click();
    await kestrel.getByRole('button', { name: 'Save accepted (2)' }).click();
    await expect(kestrel.getByRole('button', { name: 'Undo' })).toBeVisible({ timeout: 60_000 });
    await expect(labour.getByTestId('changeset-group-counts')).toContainText('2 saved');

    // 6. The register's slots hold the files, on the batch screen too.
    const [paysheet] = await registerSlot(SLUG, 'KA', 'paysheet');
    expect(paysheet?.fileName).toBe('paysheet.xlsx');
    expect((await registerSlot(SLUG, 'KA', 'attendance'))[0]?.fileName).toBe('attendance.xlsx');
    if (paysheet) {
      await page.goto(`/app/intern/labour-registers?batch=${paysheet.batchId}`);
      await expect(page.getByText('paysheet.xlsx').first()).toBeVisible({ timeout: 60_000 });
    }

    // 7. Undo from the card: the slot is empty again. The panel stays open across the page change.
    panel = page.locator('#ask-panel');
    if (!(await panel.isVisible())) panel = await openAsk(page);
    const again = panel.locator(`section[aria-label^="${KESTREL}:"]`).first();
    await expect(again).toBeVisible({ timeout: 60_000 });
    await again.getByRole('button', { name: 'Undo' }).click();
    await expect(again.locator('section[data-testid="changeset-group"][aria-label^="Labour register"]')).toContainText('Undone', { timeout: 60_000 });
    expect(await registerSlot(SLUG, 'KA', 'paysheet')).toEqual([]);
    expect(await registerSlot(SLUG, 'KA', 'attendance')).toEqual([]);

    // The other client's card is left as it came, and discarded so the next run starts clean.
    const other = panel.locator(`section[aria-label^="${SOLSTICE}:"]`).first();
    await other.getByRole('button', { name: 'Discard' }).click();
    await expect(other).toContainText('Discarded');
    expect(await registerSlot(SECOND_SLUG, 'TG', 'paysheet')).toEqual([]);
  });
});
