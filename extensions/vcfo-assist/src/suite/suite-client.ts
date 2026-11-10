/**
 * SUITE CLIENT — every VCFO Suite API call the extension makes, in one place.
 *
 * The calls do not leave the extension directly. Each one is a same-origin `fetch` run inside an
 * open, signed-in VCFO Suite tab (`TabFetch`, implemented in `./tab-fetch.ts` with
 * `chrome.scripting.executeScript`), so the Auth.js session cookie is sent normally and Suite
 * needs no CORS headers, no OPTIONS handler and no token (docs/specs/assist-profile/06-no-cors.md).
 *
 * The paths and response shapes follow docs/specs/vcfo-assist-agents/API.md.
 */
import type { ResolveContext, RunCreate, RunUpdate, SuitePort } from '../engine/ports';
import type { Catalog, EngagementSummary, PatchProposal, ProfileResult, ResolvePayload, ResolveResponse, SignedRecipe } from '../shared/types';

export const DEFAULT_SUITE_ORIGINS: readonly string[] = ['http://localhost:3000', 'https://app.sbctrack.in'];

const enc = encodeURIComponent;

export const SUITE_PATHS = {
  engagements: () => '/api/engagements',
  catalog: () => '/api/assist/catalog',
  recipe: (id: string) => `/api/assist/recipes/${enc(id)}`,
  resolve: () => '/api/assist/resolve',
  patches: () => '/api/assist/patches',
  profile: (engagementId: string) => `/api/engagements/${enc(engagementId)}/assist-profile`,
  runs: (engagementId: string) => `/api/engagements/${enc(engagementId)}/assist-runs`,
  run: (engagementId: string, runId: string) => `/api/engagements/${enc(engagementId)}/assist-runs/${enc(runId)}`,
  /**
   * Where "Fix in Suite" opens: Suite redirects to the engagement's checklist step in the shell the
   * signed-in role can open (lead, manager or admin), or to the engagement page without a step.
   */
  fixInSuite: (engagementId: string, stepId?: string) =>
    engagementId ? `/api/assist/step-link/${enc(engagementId)}${stepId ? `?step=${enc(stepId)}` : ''}` : '/',
};

export interface TabFetchResult {
  status: number;
  json: unknown;
}

/** Runs `fetch(path, …)` inside a Suite tab. Throws when no Suite tab is open. */
export type TabFetch = (path: string, init: { method: string; body?: unknown }) => Promise<TabFetchResult>;

export class SuiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The catalog used when Suite has no catalog route yet. Live use stays off. */
export const DEFAULT_CATALOG: Catalog = {
  liveAllowed: false,
  agents: [
    {
      id: 'incorporation',
      name: 'Incorporation',
      subAgents: [
        { id: 'spice-a', name: 'SPICe+ Part A (name reservation)', recipeId: 'spice-a', form: 'SPICe+ Part A' },
        { id: 'spice-b', name: 'SPICe+ Part B (incorporation form)', recipeId: 'spice-b', form: 'SPICe+ Part B' },
        { id: 'agile-pro-s', name: 'AGILE-PRO-S', form: 'AGILE-PRO-S' },
      ],
    },
    { id: 'post-incorporation', name: 'Post-incorporation', subAgents: [{ id: 'inc-20a', name: 'INC-20A (commencement)', form: 'INC-20A' }] },
    { id: 'registration', name: 'Registration', subAgents: [{ id: 'gst-reg-01', name: 'GST REG-01', form: 'GST REG-01' }] },
    { id: 'compliance', name: 'Compliance', subAgents: [{ id: 'dir-3-kyc', name: 'DIR-3 KYC', form: 'DIR-3 KYC' }] },
  ],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drops undefined members, so a strict schema on the Suite side sees only real keys. */
function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function errorText(json: unknown, status: number): string {
  if (isObj(json) && typeof json.error === 'string') return `${json.error} (${status})`;
  return `HTTP ${status}`;
}

export function parseEngagements(json: unknown): EngagementSummary[] {
  const list = isObj(json) && Array.isArray(json.engagements) ? json.engagements : Array.isArray(json) ? json : [];
  return list
    .filter(isObj)
    .map((e) => ({
      id: String(e.id ?? ''),
      name: String(e.companyName ?? e.name ?? e.clientName ?? e.slug ?? e.id ?? ''),
      slug: typeof e.slug === 'string' ? e.slug : undefined,
    }))
    .filter((e) => e.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Suite's catalog: `{ liveEnabled, mockHosts, agents: [{ id, title, subAgents: [{ id, title, form,
 * recipeId, status, portalHost }] }] }`. Anything but an explicit `true` keeps live use off. Suite's
 * `mockHosts` is ignored on purpose: the extension's own mock list cannot be widened by a server.
 */
export function parseCatalog(json: unknown): Catalog {
  const body = isObj(json) && isObj(json.catalog) ? json.catalog : json;
  if (!isObj(body) || !Array.isArray(body.agents)) return DEFAULT_CATALOG;
  return {
    liveAllowed: body.liveEnabled === true || body.liveAllowed === true,
    liveHosts: Array.isArray(body.liveHosts) ? body.liveHosts.map(String) : undefined,
    agents: body.agents.filter(isObj).map((a) => ({
      id: String(a.id),
      name: String(a.title ?? a.name ?? a.id),
      subAgents: (Array.isArray(a.subAgents) ? a.subAgents : []).filter(isObj).map((s) => {
        const title = String(s.title ?? s.name ?? s.id);
        const form = typeof s.form === 'string' ? s.form : undefined;
        return {
          id: String(s.id),
          name: form && form !== title ? `${form} (${title.charAt(0).toLowerCase()}${title.slice(1)})` : title,
          form,
          recipeId: typeof s.recipeId === 'string' && s.recipeId ? s.recipeId : undefined,
          stepId: typeof s.stepId === 'string' && s.stepId ? s.stepId : undefined,
        };
      }),
    })),
  };
}

export function parseSignedRecipe(json: unknown): SignedRecipe {
  if (isObj(json) && isObj(json.recipe) && typeof json.sig === 'string') {
    return {
      recipe: json.recipe,
      sig: json.sig,
      alg: typeof json.alg === 'string' ? json.alg : undefined,
      keyId: typeof json.keyId === 'string' ? json.keyId : undefined,
    };
  }
  throw new SuiteError('recipe response has no recipe and sig', 502);
}

export function parseProfile(json: unknown): ProfileResult {
  if (!isObj(json) || !isObj(json.profile)) throw new SuiteError('profile response has no profile', 502);
  return {
    schemaVersion: Number(json.schemaVersion ?? 0),
    companyName: String(json.companyName ?? ''),
    profile: json.profile as Record<string, unknown>,
    missing: Array.isArray(json.missing) ? (json.missing as ProfileResult['missing']) : [],
    notes: Array.isArray(json.notes) ? (json.notes as ProfileResult['notes']) : [],
  };
}

export function parseRunId(json: unknown): string | null {
  if (!isObj(json)) return null;
  if (typeof json.runId === 'string') return json.runId;
  if (typeof json.id === 'string') return json.id;
  if (isObj(json.run) && typeof json.run.id === 'string') return json.run.id;
  return null;
}

export function parseResolve(json: unknown): ResolveResponse {
  const body = isObj(json) ? json : {};
  return {
    choice: body.choice === null || typeof body.choice === 'number' ? (body.choice as number | null) : (body.choice as never),
    tier: String(body.tier ?? ''),
    tokens: Number(body.tokens ?? 0) || 0,
    aiCalls: typeof body.aiCalls === 'number' ? body.aiCalls : undefined,
  };
}

export class SuiteClient implements SuitePort {
  constructor(private readonly fetchInTab: TabFetch) {}

  private async call(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const res = await this.fetchInTab(path, { method, body });
    if (res.status < 200 || res.status >= 300) throw new SuiteError(errorText(res.json, res.status), res.status);
    return res.json;
  }

  async engagements(): Promise<EngagementSummary[]> {
    return parseEngagements(await this.call(SUITE_PATHS.engagements()));
  }

  async catalog(): Promise<Catalog> {
    try {
      return parseCatalog(await this.call(SUITE_PATHS.catalog()));
    } catch (err) {
      // The catalog route may not exist yet. Only a 404 falls back; live use stays off either way.
      if (err instanceof SuiteError && err.status === 404) return DEFAULT_CATALOG;
      throw err;
    }
  }

  async recipe(id: string): Promise<SignedRecipe> {
    return parseSignedRecipe(await this.call(SUITE_PATHS.recipe(id)));
  }

  async profile(engagementId: string): Promise<ProfileResult> {
    return parseProfile(await this.call(SUITE_PATHS.profile(engagementId)));
  }

  async createRun(engagementId: string, body: RunCreate): Promise<{ runId: string } | null> {
    const { subAgent, portalHost, recipeVersion, fieldsTotal, state } = body;
    const runId = parseRunId(await this.call(SUITE_PATHS.runs(engagementId), 'POST', strip({ subAgent, portalHost, recipeVersion, fieldsTotal, state })));
    return runId ? { runId } : null;
  }

  async updateRun(engagementId: string, runId: string, body: RunUpdate): Promise<void> {
    const { status, state, fieldsTotal, fieldsFilled, heals, refusals, srn, error } = body;
    await this.call(SUITE_PATHS.run(engagementId, runId), 'PATCH', strip({ status, state, fieldsTotal, fieldsFilled, heals, refusals, srn, error }));
  }

  /** Labels and key names only: `payload` is built by `heal/payload.ts`, which never sees a value. */
  async resolve(payload: ResolvePayload, ctx: ResolveContext): Promise<ResolveResponse> {
    const { fieldKey, fieldLabel, candidates } = payload;
    const runId = ctx.runId && UUID.test(ctx.runId) ? ctx.runId : undefined;
    const body = strip({ fieldKey, fieldLabel, candidates, recipeId: ctx.recipeId, runId });
    return parseResolve(await this.call(SUITE_PATHS.resolve(), 'POST', body));
  }

  async proposePatch(patch: PatchProposal): Promise<void> {
    const { recipeId, recipeVersion, fieldKey, proposed, evidence, sourceTier, runId } = patch;
    const body = strip({
      recipeId,
      recipeVersion,
      fieldKey,
      proposed: strip({ som: proposed.som, css: proposed.css, label: proposed.label }),
      evidence: strip({ fieldLabel: evidence.fieldLabel, chosenLabel: evidence.chosenLabel, note: evidence.note }),
      sourceTier,
      runId: runId && UUID.test(runId) ? runId : undefined,
    });
    await this.call(SUITE_PATHS.patches(), 'POST', body);
  }
}
