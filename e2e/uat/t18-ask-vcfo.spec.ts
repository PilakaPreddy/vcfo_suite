import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, note, shot, step, seen, settle } from './helpers/uat';

/**
 * T-18 Ask VCFO, without a model key (owner decision): the parts that need no model are tested,
 * and answer quality is left for a person with the key turned on.
 */
const T = 'T-18';
firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-18 Ask VCFO (chatbot)', async ({ browser }) => {
  const client = await as(browser, 'clientB');

  await step(client, { test: T, step: 3, role: 'clientB', caption: 'The client opens Ask VCFO and clicks a suggested question about their own project; it answers from the project with no model.' }, async () => {
    await client.goto('/app/client/ask');
    await settle(client, /Quick start|Ask/);
    const quick = client.getByRole('list', { name: 'Quick start' }).getByRole('button').first();
    const q = (await quick.innerText()).trim();
    await quick.click();
    await expect(seen(client, /Helpful\?|Was this helpful/)).toBeVisible({ timeout: 45_000 });
    const text = await client.locator('main').innerText();
    expect(text).not.toMatch(/unavailable right now/);
    expect(text).not.toMatch(/Nilgiri|Sahyadri/);
    return { caption: `Asked "${q}". The answer comes from Kaveri Foods' own project and names no other company.`, marks: [{ at: seen(client, /Reviewed by SBC|Sources/), kind: 'ok', n: 1 }] };
  });

  await step(client, { test: T, step: 4, role: 'clientB', caption: 'The client asks about a different company (Nilgiri Analytics) and gets none of its data.' }, async () => {
    await client.goto('/app/client/ask');
    await settle(client, /Quick start|Ask/);
    const box = client.getByRole('textbox').locator('visible=true').first();
    await box.fill('What is the status of Nilgiri Analytics Private Limited and who are its directors?');
    await box.press('Enter');
    await client.waitForTimeout(8000);
    const text = await client.locator('main').innerText();
    expect(text).not.toMatch(/Kiran Rao|Meera Iyer|62011|Residency Road/);
    return { caption: 'No director name, address or code of the other company appears in the reply.', marks: [{ at: seen(client, /unavailable|only help|can't|cannot|your company/i), kind: 'ok', n: 1 }] };
  });

  await step(client, { test: T, step: 4, role: 'clientB', caption: 'An off-topic request is not answered.' }, async () => {
    const box = client.getByRole('textbox').locator('visible=true').first();
    await box.fill('Write me a python script that scrapes a website.');
    await box.press('Enter');
    await expect(seen(client, /only help with your company setup|unavailable right now/)).toBeVisible({ timeout: 45_000 });
    return { marks: [{ at: seen(client, /only help with your company setup|unavailable right now/), kind: 'ok', n: 1 }] };
  });

  const lead = await as(browser, 'lead2');
  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead opens the Ask VCFO panel from the launcher and sees suggestions.' }, async () => {
    await lead.goto('/app/intern/today');
    await settle(lead);
    await lead.locator('button[aria-controls="ask-panel"]').first().click();
    const panel = lead.locator('#ask-panel');
    await expect(panel).toBeVisible();
    await shot(lead, { test: T, step: 1, role: 'lead2', status: 'pass', caption: 'The staff Ask VCFO panel is open.', marks: [{ at: panel, kind: 'ok', n: 1 }] });
    const res = await lead.request.get('/api/ask/suggestions?shell=client');
    expect(res.status()).toBe(403);
    return { caption: `The staff panel opens. A lead asking for the client-shell suggestions is refused (HTTP ${res.status()}).` };
  });

  note({ test: T, step: 2, status: 'untestable', caption: 'The 10 real questions (5 about the project, 5 about compliance law) and the paste-and-review card.', detail: 'These need the model (ANSWER and EXTRACT), and this run had no API key by the owner\'s decision. With ANTHROPIC_API_KEY set, a person asks the 10 questions on the list and checks each answer, and pastes director details to accept one review card.' });
});
