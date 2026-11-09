/**
 * Contract test against Suite's own request schemas (docs/specs/vcfo-assist-agents/API.md). It
 * runs a full mock filing and a T3 heal through the real SuiteClient, captures every request body,
 * and parses each with the zod schema the Suite route uses. Skipped when the extension is built
 * outside the Suite repository.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunEngine } from '../engine/runner';
import { BUNDLED_RECIPES } from '../recipes';
import { SuiteClient, type TabFetchResult } from './suite-client';
import { JsdomPortal, MemoryStore, PROFILE_VALUES, SENTINEL_PROFILE, loadMockPage, pdfDrop } from '../test/mock-env';

const SUITE_LIB = path.resolve(__dirname, '../../../../src/lib/assist-agents');
const present = existsSync(path.join(SUITE_LIB, 'api-schemas.ts'));

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

function client(sent: Sent[], choice: (body: { candidates: Array<{ i: number; name?: string }> }) => number | null) {
  return new SuiteClient(async (p, init): Promise<TabFetchResult> => {
    sent.push({ method: init.method, path: p, body: init.body });
    if (p.endsWith('/assist-profile')) return { status: 200, json: { ok: true, ...SENTINEL_PROFILE } };
    if (p.startsWith('/api/assist/recipes/')) return { status: 404, json: { ok: false, error: 'not_found' } };
    if (p.endsWith('/assist-runs') && init.method === 'POST') return { status: 201, json: { ok: true, run: { id: '0b6f3c2a-1b1d-4e2f-8a3b-9c4d5e6f7a8b' } } };
    if (p.includes('/assist-runs/')) return { status: 200, json: { ok: true } };
    if (p === '/api/assist/resolve') return { status: 200, json: { ok: true, choice: choice(init.body as never), confidence: 0.9, tier: 'T3', tokens: 800, aiCalls: 1 } };
    if (p === '/api/assist/patches') return { status: 201, json: { ok: true } };
    return { status: 404, json: { ok: false, error: 'not_found' } };
  });
}

describe.skipIf(!present)("Suite API contract (Suite's own zod schemas)", async () => {
  // Literal imports so Vite can load Suite's sources; this file is excluded from the extension's
  // tsc (tsconfig.json) because those sources use Suite's own `@/` paths and non-strict settings.
  const { createAgentRunSchema, updateAgentRunSchema, proposePatchSchema } = await import('../../../../src/lib/assist-agents/api-schemas');
  const { recipeSchema } = await import('../../../../src/lib/assist-agents/recipe');
  const RESOLVE_KEYS = ['candidates', 'fieldKey', 'fieldLabel', 'recipeId', 'runId'];

  function checkAll(sent: Sent[]) {
    for (const s of sent) {
      if (s.method === 'POST' && s.path.endsWith('/assist-runs')) expect(createAgentRunSchema.safeParse(s.body).success, JSON.stringify(s.body)).toBe(true);
      if (s.method === 'PATCH') {
        const r = updateAgentRunSchema.safeParse(s.body);
        expect(r.success, `${JSON.stringify(s.body)} ${r.success ? '' : r.error.issues[0]?.message}`).toBe(true);
      }
      if (s.path === '/api/assist/patches') {
        const r = proposePatchSchema.safeParse(s.body);
        expect(r.success, `${JSON.stringify(s.body)} ${r.success ? '' : r.error.issues[0]?.message}`).toBe(true);
      }
      if (s.path === '/api/assist/resolve') {
        const body = s.body as Record<string, unknown>;
        expect(Object.keys(body).every((k) => RESOLVE_KEYS.includes(k))).toBe(true);
        expect(body.recipeId).toBe('spice-a');
      }
    }
    const outbound = JSON.stringify(sent.filter((s) => s.method !== 'GET').map((s) => s.body));
    for (const v of PROFILE_VALUES) expect(outbound).not.toContain(v);
  }

  it('the bundled recipe passes Suite\'s recipe schema', () => {
    const r = recipeSchema.safeParse(BUNDLED_RECIPES['spice-a']!.recipe);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues[0])).toBe(true);
  });

  it('a full mock filing sends only bodies Suite accepts', async () => {
    loadMockPage('spice-a.html');
    const sent: Sent[] = [];
    const portal = new JsdomPortal();
    const engine = new RunEngine({ suite: client(sent, () => null), store: new MemoryStore(), portalFor: () => portal, bundledRecipes: BUNDLED_RECIPES });
    await engine.start({ engagementId: 'eng-1', agentId: 'incorporation', subAgentId: 'spice-a', recipeId: 'spice-a', portalTabId: 1 });
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    await engine.send(await pdfDrop());
    await engine.settle();
    document.getElementById('btn-submit')!.click();
    document.getElementById('btn-pay')!.click();
    await engine.tick();
    await engine.settle();
    expect(engine.run!.state).toBe('DONE');
    expect(sent.some((s) => s.method === 'PATCH' && (s.body as { srn?: string }).srn === 'AB1234567')).toBe(true);
    checkAll(sent);
  });

  it('a T3 heal and its patch proposal send only bodies Suite accepts', async () => {
    loadMockPage('spice-a-drift.html');
    document.querySelector('label[for="nameOption2"]')!.textContent = 'Alternative choice';
    const sent: Sent[] = [];
    const portal = new JsdomPortal();
    const engine = new RunEngine({
      suite: client(sent, (b) => b.candidates.find((c) => c.name === 'nameOption2')?.i ?? null),
      store: new MemoryStore(),
      portalFor: () => portal,
      bundledRecipes: BUNDLED_RECIPES,
    });
    await engine.start({ engagementId: 'eng-1', agentId: 'incorporation', subAgentId: 'spice-a', recipeId: 'spice-a', portalTabId: 1 });
    await engine.settle();
    await engine.send({ type: 'LOGGED_IN' });
    await engine.settle();
    await engine.send({ type: 'CONFIRM_FILL' });
    await engine.settle();
    expect(sent.some((s) => s.path === '/api/assist/resolve')).toBe(true);
    expect(sent.some((s) => s.path === '/api/assist/patches')).toBe(true);
    checkAll(sent);
  });
});
