/**
 * The engine's ports. The background service worker implements them with chrome APIs
 * (`entrypoints/background.ts`); the unit tests implement them with fakes. The engine never sees
 * a chrome API, a tab id it did not get from here, or a network call it did not make through
 * `SuitePort`.
 */
import type {
  Catalog,
  FieldTarget,
  PatchProposal,
  ProfileResult,
  Recipe,
  RecipeGate,
  ResolvePayload,
  ResolveResponse,
  Run,
  ScanResult,
  ScannedField,
  SignedRecipe,
  GuardRefusal,
} from '../shared/types';
import type { FillResult } from '../portal/filler';
import type { ClickResult, PrepareResult } from '../portal/agent';
import type { BridgeNode } from '../portal/bridge';
import type { ScanOptions } from '../portal/scanner';

/** POST /api/engagements/:id/assist-runs (strict body; Suite fills agent and recipe id). */
export interface RunCreate {
  subAgent: string;
  portalHost: string;
  recipeVersion?: string;
  fieldsTotal?: number;
  state?: string;
}

/**
 * PATCH /api/engagements/:id/assist-runs/:runId (strict body). Labels and counts only, never a
 * value. `heals` and `refusals` replace the stored lists, so the full lists go every time.
 */
export interface RunUpdate {
  status?: 'running' | 'waiting_user' | 'done' | 'failed' | 'cancelled';
  state?: string;
  fieldsTotal?: number;
  fieldsFilled?: number;
  heals?: Array<{ field: string; tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4'; ok: boolean }>;
  refusals?: Array<{ kind: string; target?: string; at?: string }>;
  srn?: string | null;
  error?: string | null;
}

/** What else the resolver call carries besides the labels-only payload. */
export interface ResolveContext {
  recipeId: string;
  runId?: string;
}

export interface SuitePort {
  catalog(): Promise<Catalog>;
  recipe(id: string): Promise<SignedRecipe>;
  profile(engagementId: string): Promise<ProfileResult>;
  createRun(engagementId: string, body: RunCreate): Promise<{ runId: string } | null>;
  updateRun(engagementId: string, runId: string, body: RunUpdate): Promise<void>;
  resolve(payload: ResolvePayload, ctx: ResolveContext): Promise<ResolveResponse>;
  proposePatch(patch: PatchProposal): Promise<void>;
}

export type TeachResult =
  | { target: FieldTarget; field: Pick<ScannedField, 'label' | 'name' | 'som' | 'css'> }
  | { refused: GuardRefusal }
  | null;

export interface PortalPort {
  /** The portal tab's URL and whether it is the active tab of its window (G12). */
  tabInfo(): Promise<{ url: string; active: boolean } | null>;
  readBridge(): Promise<{ present: boolean; nodes: BridgeNode[] }>;
  scan(opts: ScanOptions): Promise<ScanResult>;
  prepareFill(target: FieldTarget, label: string): Promise<PrepareResult>;
  /** MAIN world: guideBridge.resolveNode(som).value = value. */
  bridgeSet(som: string, value: string): Promise<{ ok: boolean; reason?: string }>;
  fill(target: FieldTarget, value: string, label: string, bridgeTried: boolean): Promise<FillResult>;
  click(target: { css?: string; text?: string }, label: string, resultCss?: string): Promise<ClickResult>;
  attach(css: string, name: string, base64: string): Promise<{ ok: boolean; sha256?: string; reason?: string }>;
  highlightHuman(gates: RecipeGate[]): Promise<number>;
  readSrn(pattern?: string): Promise<string | null>;
  teach(label: string): Promise<TeachResult>;
  cancelTeach(): Promise<void>;
  banner(text: string | null): Promise<void>;
}

/** What survives a service-worker restart or a tab reload (chrome.storage.session). */
export interface Persisted {
  run: Run;
  recipe?: Recipe;
  profile?: ProfileResult;
  /** The dropped signed PDF, base64. Its bytes are never changed (G6). */
  pdfBase64?: string;
}

export interface StorePort {
  load(): Promise<Persisted | null>;
  save(p: Persisted): Promise<void>;
  clear(): Promise<void>;
}
