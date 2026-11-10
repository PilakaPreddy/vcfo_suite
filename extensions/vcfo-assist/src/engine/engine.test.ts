import { beforeEach, describe, expect, it } from 'vitest';
import { RunEngine, StartRefused } from './runner';
import { canTransition, transition, IllegalTransition, TERMINAL } from './machine';
import { applyTransform, getPath } from './values';
import { liveAllowedFor, isMockHost } from './live';
import { RECIPE_PUBLIC_KEYS, canonicalJson, validateRecipe, verifySignature } from './recipe';
import { globMatch, pageMatchesUrl } from './url';
import { expandFields, expandRecipe, MAX_REPEAT } from './expand';
import { normalizeRecipe } from '../recipes/normalize';
import { BUNDLED_RECIPES } from '../recipes';
import { FakeSuite, JsdomPortal, MemoryStore, PART_B_PROFILE, PART_B_VALUES, PROFILE_VALUES, loadMockPage, mockState, pdfDrop } from '../test/mock-env';
import type { Run, RunState, SignedRecipe } from '../shared/types';

type Raw = { title: string; version: string; actions: Array<Record<string, unknown>> };

const START = { engagementId: 'eng-1', engagementName: 'Sentinel', agentId: 'incorporation', subAgentId: 'spice-a', recipeId: 'spice-a', portalTabId: 7 };

function setup(page: Parameters<typeof loadMockPage>[0] = 'spice-a.html') {
  loadMockPage(page);
  const suite = new FakeSuite();
  const portal = new JsdomPortal();
  const store = new MemoryStore();
  let t = 1_000;
  const engine = new RunEngine({ suite, store, portalFor: () => portal, bundledRecipes: BUNDLED_RECIPES, now: () => (t += 10), newId: () => 'run-1' });
  return { suite, portal, store, engine };
}

const value = (name: string) => (document.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
const states = (run: Run): RunState[] =>
  run.log.filter((l) => l.kind === 'transition').map((l) => l.text.split(' → ')[1]!.split(' ')[0] as RunState);

/** A throwaway Ed25519 key, for recipes the tests sign themselves. */
async function testKey(): Promise<{ raw: string; sign: (recipe: unknown) => Promise<string> }> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  return {
    raw,
    sign: async (recipe) => Buffer.from(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(canonicalJson(recipe)))).toString('base64'),
  };
}

describe('state machine', () => {
  it('allows only the table moves and any live state to FAILED or CANCELLED', () => {
    expect(canTransition('READY', 'PULL_PROFILE')).toBe(true);
    expect(canTransition('READY', 'FILL')).toBe(false);
    expect(canTransition('WAIT_SUBMIT_PAY', 'READ_SRN')).toBe(true);
    expect(canTransition('FILL', 'WAIT_SUBMIT_PAY')).toBe(false);
    expect(canTransition('WAIT_DSC', 'CANCELLED')).toBe(true);
    for (const s of TERMINAL) expect(canTransition(s, 'FAILED')).toBe(false);
  });

  it('logs every transition and throws on an illegal one', () => {
    const run = { state: 'READY', log: [] } as unknown as Run;
    const moved = transition(run, 'PULL_PROFILE', 'x', 5);
    expect(moved.log[0]).toMatchObject({ kind: 'transition', text: 'READY → PULL_PROFILE (x)' });
    expect(() => transition(moved, 'DONE', '', 6)).toThrow(IllegalTransition);
  });
});

describe('values', () => {
  it('reads key paths and applies transforms', () => {
    expect(getPath({ a: { b: ['x', 'y'] } }, 'a.b.1')).toBe('y');
    expect(applyTransform('Test Co', 'upper')).toBe('TEST CO');
    expect(applyTransform('2026-01-31', 'date')).toBe('31/01/2026');
    expect(applyTransform(false, 'yesNo')).toBe('No');
    expect(applyTransform('62011', 'nicDivision')).toBe('62');
    expect(applyTransform(undefined, 'upper')).toBeUndefined();
    expect(applyTransform({ a: 1 })).toBeUndefined();
  });
});

describe('live switch (G11)', () => {
  it('allows mock hosts and refuses live hosts unless Suite allows them', () => {
    expect(isMockHost('127.0.0.1')).toBe(true);
    expect(liveAllowedFor(null, 'www.mca.gov.in')).toBe(false);
    expect(liveAllowedFor({ liveAllowed: false, agents: [] }, 'www.mca.gov.in')).toBe(false);
    expect(liveAllowedFor({ liveAllowed: true, agents: [] }, 'www.mca.gov.in')).toBe(true);
    expect(liveAllowedFor({ liveAllowed: true, liveHosts: ['www.mca.gov.in'], agents: [] }, 'www.gst.gov.in')).toBe(false);
  });
});

describe('recipes (G15)', () => {
  const bundled = BUNDLED_RECIPES['spice-a']!;
  const raw = () => structuredClone(bundled.recipe) as Raw;

  it('the bundled recipes carry the dev signature, verify on the mock and are well formed', async () => {
    expect(Object.keys(BUNDLED_RECIPES).sort()).toEqual(['spice-a', 'spice-b']);
    for (const signed of Object.values(BUNDLED_RECIPES)) {
      expect(signed).toMatchObject({ alg: 'ed25519', keyId: 'dev' });
      expect(await verifySignature(signed, '127.0.0.1')).toEqual({ ok: true, keyId: 'dev' });
      expect(validateRecipe(normalizeRecipe(signed.recipe))).toEqual([]);
    }
    const recipe = normalizeRecipe(bundled.recipe);
    expect(recipe.attachCss).toBe('#signed-pdf');
    expect(recipe.actions.filter((a) => a.kind === 'safe').map((a) => a.role)).toEqual(['save', 'check', 'download']);
    expect(recipe.gates.find((g) => g.kind === 'SUBMIT')).toMatchObject({ text: 'Submit' });
  });

  it('the dev key is refused on a live host, before its signature counts', async () => {
    const r = await verifySignature(bundled, 'www.mca.gov.in');
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toMatch(/dev key.*mock hosts only/);
  });

  it('refuses an unknown key id, the prod placeholder, another algorithm and no key id', async () => {
    expect(RECIPE_PUBLIC_KEYS.prod).toBeNull();
    expect((await verifySignature({ ...bundled, keyId: 'prod' }, '127.0.0.1')).reason).toMatch(/not built into the extension/);
    expect((await verifySignature({ ...bundled, keyId: 'evil' }, '127.0.0.1')).ok).toBe(false);
    expect((await verifySignature({ ...bundled, keyId: '__proto__' }, '127.0.0.1')).ok).toBe(false);
    expect((await verifySignature({ ...bundled, keyId: undefined }, '127.0.0.1')).ok).toBe(false);
    expect((await verifySignature({ ...bundled, alg: 'HMAC-SHA256' }, '127.0.0.1')).reason).toMatch(/not ed25519/);
  });

  it('a recipe with one changed byte, or a bad signature, is refused', async () => {
    const tampered: SignedRecipe = { ...bundled, recipe: { ...raw(), title: `${raw().title.slice(0, -1)}X` } };
    expect((await verifySignature(tampered, '127.0.0.1')).reason).toMatch(/does not match/);
    expect((await verifySignature({ ...bundled, sig: 'not base64!' }, '127.0.0.1')).ok).toBe(false);
    expect((await verifySignature({ ...bundled, sig: Buffer.alloc(64).toString('base64') }, '127.0.0.1')).ok).toBe(false);
  });

  it('a key other than dev is accepted on a live host when it is built in', async () => {
    const key = await testKey();
    const signed: SignedRecipe = { recipe: raw(), sig: await key.sign(raw()), alg: 'ed25519', keyId: 'prod' };
    expect(await verifySignature(signed, 'www.mca.gov.in', { ...RECIPE_PUBLIC_KEYS, prod: key.raw })).toEqual({ ok: true, keyId: 'prod' });
    expect((await verifySignature(signed, 'www.mca.gov.in')).ok).toBe(false);
  });

  it('a validly signed recipe with a new action kind, or a "safe" Submit, is refused by shape', async () => {
    const newKind = raw();
    newKind.actions.push({ id: 'solve', kind: 'auto', label: 'Solve captcha', match: { css: '#x' } });
    expect(validateRecipe(normalizeRecipe(newKind)).join(' ')).toMatch(/unknown kind/);
    const safeSubmit = raw();
    safeSubmit.actions.push({ id: 'go', kind: 'safe', label: 'Final Submit', match: { text: 'Final Submit' } });
    expect(validateRecipe(normalizeRecipe(safeSubmit)).join(' ')).toMatch(/G4/);
    const key = await testKey();
    expect((await verifySignature({ recipe: newKind, sig: await key.sign(newKind), alg: 'ed25519', keyId: 't' }, '127.0.0.1', { t: key.raw })).ok).toBe(true);
  });
});

describe('page check (urlPattern)', () => {
  const page = { urlPattern: '/content/mca/global/en/mca/e-filing/incorporation-change-services/spice-plus*', mockUrlPattern: '/spice-a*.html' };

  it('matches the glob against the whole path', () => {
    expect(globMatch('/spice-a*.html', '/spice-a.html')).toBe(true);
    expect(globMatch('/spice-a*.html', '/spice-a-drift.html')).toBe(true);
    expect(globMatch('/spice-a*.html', '/spice-b.html')).toBe(false);
    expect(globMatch('/a?c', '/abc')).toBe(true);
    expect(globMatch('/a.c', '/abc')).toBe(false);
  });

  it('uses the mock pattern on a mock host and the portal pattern elsewhere', () => {
    expect(pageMatchesUrl(page, 'http://127.0.0.1:4318/spice-a.html')).toBe(true);
    expect(pageMatchesUrl(page, 'http://127.0.0.1:4318/spice-b.html')).toBe(false);
    expect(pageMatchesUrl(page, 'https://www.mca.gov.in/content/mca/global/en/mca/e-filing/incorporation-change-services/spice-plus.html')).toBe(true);
    expect(pageMatchesUrl(page, 'https://www.mca.gov.in/spice-a.html')).toBe(false);
    expect(pageMatchesUrl(page, 'not a url')).toBe(false);
  });
});

describe('repeating groups (each)', () => {
  const recipe = normalizeRecipe(BUNDLED_RECIPES['spice-b']!.recipe);
  const templates = recipe.pages[0]!.fields;

  it('turns each template into one field per profile entry, block by block', () => {
    const fields = expandFields(templates, PART_B_PROFILE.profile);
    const directors = fields.filter((f) => f.key.startsWith('directors['));
    expect(directors.map((f) => f.key).slice(0, 3)).toEqual(['directors[0].firstName', 'directors[0].surName', 'directors[0].din']);
    expect(directors).toHaveLength(2 * templates.filter((f) => f.each === 'directors').length);
    const din2 = fields.find((f) => f.key === 'directors[1].din')!;
    expect(din2).toMatchObject({ label: 'Director 2: DIN', css: '[name="director2Din"]', name: 'director2Din', som: 'guide[0].guide1[0].guideRootPanel[0].directors[0].director[1].din[0]' });
    expect(din2.each).toBeUndefined();
    expect(fields.filter((f) => f.key.includes('{'))).toEqual([]);
  });

  it('fills no block for an empty or absent array, and caps a huge one', () => {
    const none = expandFields(templates, { ...PART_B_PROFILE.profile, directors: [], subscribers: undefined });
    expect(none.some((f) => /^(directors|subscribers)\[/.test(f.key))).toBe(false);
    const many = expandFields(templates, { directors: Array.from({ length: 99 }, () => ({})) });
    expect(many.filter((f) => f.key.endsWith('.din'))).toHaveLength(MAX_REPEAT);
  });

  it('leaves a recipe without templates as it is', () => {
    const a = normalizeRecipe(BUNDLED_RECIPES['spice-a']!.recipe);
    expect(expandRecipe(a, PART_B_PROFILE.profile).pages[0]!.fields.map((f) => f.key)).toEqual(a.pages[0]!.fields.map((f) => f.key));
  });
});

describe('run engine on the mock portal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('runs a full Part A filing with 0 AI calls, stops at every human gate and never clicks Submit or Pay', async () => {
    const { engine, suite, portal } = setup();
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_LOGIN');
    expect(engine.run!.wait).toEqual({ kind: 'login' });

    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    expect(engine.run!.state).toBe('FILL');
    expect(engine.run!.wait).toEqual({ kind: 'confirm' });
    // G13: nothing is written before the user confirms the table.
    expect(mockState().modelWrites).toEqual([]);
    expect(value('proposedName1')).toBe('');
    const planned = engine.run!.fields.filter((f) => f.status === 'planned');
    expect(planned.map((f) => f.key).sort()).toEqual(
      ['company.category', 'company.class', 'company.nicCode', 'company.proposedNames[0]', 'company.proposedNames[1]', 'company.subCategory', 'company.type'].sort(),
    );
    expect(planned.every((f) => f.tier === 'T0')).toBe(true);
    // askUser fields are the user's, whatever the profile holds.
    expect(engine.run!.fields.filter((f) => f.status === 'user').map((f) => f.key).sort()).toEqual(['company.nameSignificance', 'company.trademarkSimilar']);

    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(value('proposedName1')).toBe('Sentinel Alpha Private Limited');
    expect(value('proposedName2')).toBe('Sentinel Beta Private Limited');
    expect(value('significance')).toBe('');
    expect(value('companyType')).toBe('NEW');
    expect(value('companySubCategory')).toBe('ING');
    expect(value('mainDivision')).toBe('62');
    expect((document.querySelector('input[name="trademarkSimilar"]:checked') as HTMLInputElement | null)).toBeNull();
    // The writes went through guideBridge, the primary path.
    expect(mockState().modelWrites).toContain('proposedName1');
    expect(engine.run!.fields.filter((f) => f.status === 'filled')).toHaveLength(7);
    expect(engine.run!.aiCalls).toBe(0);
    expect(suite.resolvePayloads).toHaveLength(0);

    // Guards: the login controls were refused and stay empty.
    const codes = engine.run!.refusals.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['G1', 'G2', 'G3']));
    for (const id of ['login-user', 'login-password', 'login-captcha', 'login-otp']) {
      expect((document.getElementById(id) as HTMLInputElement).value).toBe('');
    }

    expect(engine.run!.state).toBe('WAIT_DSC');
    await engine.send(await pdfDrop());
    await engine.settle();
    expect(engine.run!.error).toBeUndefined();
    expect(engine.run!.state).toBe('WAIT_SUBMIT_PAY');
    await engine.tick();
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_SUBMIT_PAY');
    expect(mockState().clicks['btn-submit']).toBeUndefined();
    expect(mockState().clicks['btn-pay']).toBeUndefined();
    expect(portal.clickedIds).toEqual(['btn-check', 'btn-download', 'btn-check']);
    expect(portal.agent.overlay.snapshot().filter((m) => m.kind === 'human')).toHaveLength(2);

    // The human clicks Submit and Pay.
    document.getElementById('btn-submit')!.click();
    document.getElementById('btn-pay')!.click();
    await engine.tick();
    await engine.settle();
    expect(engine.run!.state).toBe('DONE');
    expect(engine.run!.srn).toBe('AB1234567');
    expect(states(engine.run!)).toEqual([
      'PULL_PROFILE', 'WAIT_LOGIN', 'FILL', 'CHECK', 'DOWNLOAD', 'WAIT_DSC', 'ATTACH', 'RECHECK', 'WAIT_SUBMIT_PAY', 'READ_SRN', 'WRITE_BACK', 'DONE',
    ]);
    const last = suite.updates.at(-1)!;
    expect(last).toMatchObject({ srn: 'AB1234567', status: 'done', state: 'DONE', fieldsFilled: 7 });
    expect(last.refusals!.map((r) => r.kind)).toEqual(expect.arrayContaining(['login', 'captcha', 'otp']));

    // G9 and G14: nothing sent to Suite carries a profile value.
    const sent = JSON.stringify(suite.calls.filter((c) => c.name !== 'profile'));
    for (const v of PROFILE_VALUES) expect(sent).not.toContain(v);
  });

  it('moves past WAIT_LOGIN by itself once the login controls are gone', async () => {
    const { engine } = setup();
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_LOGIN');
    document.getElementById('login-strip')!.hidden = true;
    await engine.tick();
    await engine.settle();
    expect(engine.run!.state).toBe('FILL');
  });

  it('resumes from storage after a restart (WAIT_DSC)', async () => {
    const { engine, store, suite, portal } = setup();
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_DSC');

    const again = new RunEngine({ suite, store, portalFor: () => portal, bundledRecipes: BUNDLED_RECIPES });
    await again.restore();
    await again.settle();
    expect(again.run!.state).toBe('WAIT_DSC');
    await again.send(await pdfDrop());
    await again.settle();
    expect(again.run!.state).toBe('WAIT_SUBMIT_PAY');
  });

  it('resumes the FILL confirmation after a restart without writing anything', async () => {
    const { engine, store, suite, portal } = setup();
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    const again = new RunEngine({ suite, store, portalFor: () => portal, bundledRecipes: BUNDLED_RECIPES });
    await again.restore();
    await again.settle();
    expect(again.run!.wait).toEqual({ kind: 'confirm' });
    expect(mockState().modelWrites).toEqual([]);
  });

  it('heals the drift page at T1 with 0 tokens and proposes a patch', async () => {
    const { engine, suite } = setup('spice-a-drift.html');
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    const name2 = engine.run!.fields.find((f) => f.key === 'company.proposedNames[1]')!;
    expect(name2).toMatchObject({ tier: 'T1', foundLabel: 'Proposed Name (Option 2)' });
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(value('nameOption2')).toBe('Sentinel Beta Private Limited');
    expect(value('proposedName1')).toBe('Sentinel Alpha Private Limited');
    expect(engine.run!.aiTokens).toBe(0);
    expect(suite.resolvePayloads).toHaveLength(0);
    expect(suite.patches).toHaveLength(1);
    expect(suite.patches[0]).toMatchObject({ fieldKey: 'company.proposedNames[1]', sourceTier: 'T1', proposed: { css: 'input#nameOption2', som: 'guide[0].guide1[0].guideRootPanel[0].nameOption2[0]', label: 'Proposed Name (Option 2)' } });
    expect(engine.run!.heals).toEqual([{ fieldKey: 'company.proposedNames[1]', tier: 'T1', label: 'Proposed name 2' }]);
  });

  it('heals at T3 when rules fail, sending labels only', async () => {
    const { engine, suite } = setup('spice-a-drift.html');
    document.querySelector('label[for="nameOption2"]')!.textContent = 'Alternative choice';
    suite.resolver = (p) => ({ choice: p.candidates.find((c) => c.name === 'nameOption2')!.i, tier: 'haiku', tokens: 1400 });
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(value('nameOption2')).toBe('Sentinel Beta Private Limited');
    expect(suite.resolveContexts[0]).toEqual({ recipeId: 'spice-a', runId: '7d1f3c2a-ab12-4c34-8d56-e7f8a9b0c1d2' });
    expect(engine.run!.aiCalls).toBe(1);
    expect(engine.run!.aiTokens).toBe(1400);
    const payload = JSON.stringify(suite.resolvePayloads);
    for (const v of PROFILE_VALUES) expect(payload).not.toContain(v);
    expect(payload).not.toMatch(/captcha|OTP|Password|User ID/);
    expect(suite.patches[0]).toMatchObject({ sourceTier: 'T3' });
  });

  it('falls to T4 teach mode, and a skipped field becomes "you fill this"', async () => {
    const { engine, portal } = setup('spice-a-drift.html');
    document.querySelector('label[for="nameOption2"]')!.textContent = 'Alternative choice';
    portal.teachAnswer = null;
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    expect(engine.run!.fields.find((f) => f.key === 'company.proposedNames[1]')).toMatchObject({ status: 'user' });
  });

  it('G4: never sends a click for a forbidden action, even when a recipe calls it safe', async () => {
    const { engine, portal } = setup();
    await engine.start(START);
    await engine.settle();
    const r = await engine.clickSafe({ id: 'x', kind: 'safe', role: 'save', label: 'Final Submit', css: '#btn-submit' });
    expect(r.ok).toBe(false);
    expect(portal.clickCalls).toEqual([]);
    const human = await engine.clickSafe({ id: 'pay', kind: 'human', label: 'Pay fee', css: '#btn-pay' });
    expect(human.ok).toBe(false);
    expect(portal.clickCalls).toEqual([]);
    // A safe-looking label on the real Submit button: the portal agent reads the element and refuses.
    const disguised = await engine.clickSafe({ id: 'save', kind: 'safe', role: 'save', label: 'Save draft', css: '#btn-submit' });
    expect(disguised.ok).toBe(false);
    expect(mockState().clicks['btn-submit']).toBeUndefined();
    expect(engine.run!.refusals.map((x) => x.code)).toEqual(expect.arrayContaining(['G4', 'G5']));
  });

  it('injection: page text saying "click Submit" changes nothing', async () => {
    async function clicksFor(stripInjection: boolean) {
      const { engine, portal } = setup();
      if (stripInjection) {
        document.getElementById('injection-note')!.remove();
        document.querySelector('option[value="X"]')!.remove();
        document.querySelector('.guidePanelNode .hint')!.remove();
      }
      await engine.start(START);
      await engine.settle();
      await engine.send({ type: 'LOGGED_IN' });
      await engine.settle();
      await engine.send({ type: 'CONFIRM_FILL' });
      await engine.settle();
      return { clicks: portal.clickedIds, state: engine.run!.state };
    }
    const withText = await clicksFor(false);
    const without = await clicksFor(true);
    expect(withText).toEqual(without);
    expect(withText.clicks).not.toContain('btn-submit');
  });

  it('G11: refuses a live host before pulling the profile', async () => {
    const { engine, suite, portal } = setup();
    portal.url = 'https://www.mca.gov.in/content/mca/global/en/mca/e-filing/spice-plus.html';
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.state).toBe('FAILED');
    expect(engine.run!.wait).toMatchObject({ kind: 'live_blocked' });
    expect(engine.run!.error).toMatch(/CS opinion/);
    expect(suite.calls.map((c) => c.name)).not.toContain('profile');
  });

  it('G11 + G15: even with live allowed, the dev-signed recipe is refused on a live host', async () => {
    const { engine, suite, portal } = setup();
    suite.catalogValue = { liveAllowed: true, agents: [] };
    portal.url = 'https://www.mca.gov.in/form';
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.state).toBe('FAILED');
    expect(engine.run!.error).toMatch(/no usable recipe/);
    expect(suite.calls.map((c) => c.name)).not.toContain('profile');
  });

  it('G15: a tampered Suite recipe is refused and the bundled one is used on the mock', async () => {
    const { engine, suite } = setup();
    const bundled = BUNDLED_RECIPES['spice-a']!;
    suite.recipeValue = { ...bundled, recipe: { ...(bundled.recipe as Raw), version: '9.9.9' } };
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.recipeVersion).toBe((bundled.recipe as Raw).version);
    expect(engine.run!.recipeFrom).toBe('bundled');
    expect(engine.run!.log.some((l) => l.text.startsWith('G15: Suite recipe refused'))).toBe(true);
  });

  it("uses Suite's recipe on the mock when Suite serves it (dev key, mock hosts only)", async () => {
    const { engine, suite } = setup();
    suite.recipeValue = structuredClone(BUNDLED_RECIPES['spice-a']!);
    await engine.start(START);
    await engine.settle();
    expect(engine.run!.recipeFrom).toBe('suite');
    expect(suite.calls.find((c) => c.name === 'createRun')!.body).toEqual({ subAgent: 'spice-a', portalHost: '127.0.0.1', recipeVersion: '1.1.0', fieldsTotal: 9, state: 'PULL_PROFILE' });
  });

  it('fills nothing while the portal tab shows another page, and goes on once the form page is back', async () => {
    const { engine, portal } = setup();
    portal.url = 'http://127.0.0.1:4318/somewhere-else.html';
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    expect(engine.run!.state).toBe('FILL');
    expect(engine.run!.wait).toEqual({ kind: 'wrong_page', page: 'SPICe+ Part A', path: '/somewhere-else.html' });
    expect(engine.run!.fields).toEqual([]);
    expect(engine.run!.log.some((l) => l.kind === 'refusal' && l.text.includes('/spice-a*.html'))).toBe(true);
    portal.url = 'http://127.0.0.1:4318/spice-a.html';
    await engine.tick();
    await engine.settle();
    expect(engine.run!.wait).toEqual({ kind: 'confirm' });
    // Navigating away between the confirmation and the write stops the write too.
    portal.url = 'http://127.0.0.1:4318/other.html';
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(engine.run!.wait).toMatchObject({ kind: 'wrong_page' });
    expect(mockState().modelWrites).toEqual([]);
    portal.url = 'http://127.0.0.1:4318/spice-a.html';
    await engine.send({ type: 'RETRY' });
    await engine.settle();
    expect(value('proposedName1')).toBe('Sentinel Alpha Private Limited');
  });

  it('G12: refuses to start in a tab that is not in front, and refuses a second run', async () => {
    const { engine, portal } = setup();
    portal.active = false;
    await expect(engine.start(START)).rejects.toBeInstanceOf(StartRefused);
    portal.active = true;
    await engine.start(START);
    await engine.settle();
    await expect(engine.start(START)).rejects.toBeInstanceOf(StartRefused);
  });

  it('cancels from a waiting state', async () => {
    const { engine } = setup();
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'CANCEL' });
    await engine.settle();
    expect(engine.run!.state).toBe('CANCELLED');
  });

  it('waits on check errors and lets the user retry', async () => {
    const { engine } = setup();
    await engine.start(START);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    // The user clears a required field before confirming; the portal check then fails.
    const fields = engine.run!.fields;
    (engine as unknown as { p: { run: Run } }).p.run.fields = fields.map((f) => (f.key === 'company.type' ? { ...f, status: 'missing' } : f));
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(engine.run!.state).toBe('CHECK');
    expect(engine.run!.wait).toMatchObject({ kind: 'check_failed' });
    (document.querySelector('[name="companyType"]') as HTMLSelectElement).value = 'NEW';
    await engine.send({ type: 'RETRY' });
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_DSC');
  });
});

describe('SPICe+ Part B on the mock portal (repeating groups)', () => {
  const START_B = { ...START, subAgentId: 'spice-b', recipeId: 'spice-b' };

  function setupB() {
    const env = setup('spice-b.html');
    env.portal.url = 'http://127.0.0.1:4318/spice-b.html';
    env.suite.profileValue = PART_B_PROFILE;
    return env;
  }

  it('fills company, office, two subscribers and two directors at T0 with 0 AI calls, and stops at the human gates', async () => {
    const { engine, suite, portal } = setupB();
    await engine.start(START_B);
    await engine.settle();
    expect(engine.run!.recipeVersion).toBe('1.0.0');
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    expect(engine.run!.wait).toEqual({ kind: 'confirm' });
    expect(mockState().modelWrites).toEqual([]);
    const planned = engine.run!.fields.filter((f) => f.status === 'planned');
    expect(planned.every((f) => f.tier === 'T0')).toBe(true);
    // Director 2 has no DIN in the profile: it is the user's, not a guess.
    expect(engine.run!.fields.find((f) => f.key === 'directors[1].din')).toMatchObject({ status: 'missing' });
    expect(engine.run!.fields.filter((f) => f.status === 'user').map((f) => f.key)).toEqual(['directors[0].designation', 'directors[1].designation']);
    expect(suite.calls.find((c) => c.name === 'createRun')!.body).toMatchObject({ subAgent: 'spice-b', fieldsTotal: 12 + 2 * 8 + 2 * 8 });

    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(value('authorisedCapital')).toBe('1000000');
    expect(value('faceValue')).toBe('10');
    expect(value('officeLine1')).toBe('Sentinel Tower 1');
    expect(value('officeState')).toBe('TG');
    expect(value('subscriber1FirstName')).toBe('Subone');
    expect(value('subscriber1Pan')).toBe('SENTB1234C');
    expect(value('subscriber1Dob')).toBe('01/02/1980');
    expect(value('subscriber2Shares')).toBe('5000');
    expect(value('director1Din')).toBe('09876543');
    expect(value('director2FirstName')).toBe('Dirtwo');
    expect(value('director2Din')).toBe('');
    expect(value('director1Designation')).toBe('');
    expect(mockState().modelWrites).toContain('director2FirstName');
    expect(engine.run!.aiCalls).toBe(0);
    expect(suite.resolvePayloads).toHaveLength(0);
    expect(engine.run!.state).toBe('WAIT_DSC');

    await engine.send(await pdfDrop());
    await engine.settle();
    expect(engine.run!.state).toBe('WAIT_SUBMIT_PAY');
    expect(mockState().clicks['btn-submit']).toBeUndefined();
    expect(portal.clickedIds).toEqual(['btn-check', 'btn-download', 'btn-check']);
    document.getElementById('btn-submit')!.click();
    document.getElementById('btn-pay')!.click();
    await engine.tick();
    await engine.settle();
    expect(engine.run!.state).toBe('DONE');
    expect(engine.run!.srn).toBe('AC7654321');

    const sent = JSON.stringify(suite.calls.filter((c) => c.name !== 'profile'));
    for (const v of [...PART_B_VALUES, ...PROFILE_VALUES]) expect(sent).not.toContain(v);
  });

  it('keeps the expanded plan across a restart', async () => {
    const { engine, store, suite, portal } = setupB();
    await engine.start(START_B);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    const again = new RunEngine({ suite, store, portalFor: () => portal, bundledRecipes: BUNDLED_RECIPES });
    await again.restore();
    await again.settle();
    await again.send({ type: 'CONFIRM_FILL' });
    await again.settle();
    expect(value('director2Pan')).toBe('SENTE2222F');
  });

  it('refuses to fill the Part B recipe on the Part A page', async () => {
    const { engine, portal } = setupB();
    portal.url = 'http://127.0.0.1:4318/spice-a.html';
    await engine.start(START_B);
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    expect(engine.run!.wait).toMatchObject({ kind: 'wrong_page', page: 'SPICe+ Part B' });
  });
});
