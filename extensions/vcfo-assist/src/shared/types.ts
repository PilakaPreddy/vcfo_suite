/**
 * Types shared by the run engine, the portal scripts and the side panel.
 *
 * Nothing here imports chrome APIs, so the engine, guards and heal ladder stay testable in plain
 * Node with a jsdom document.
 */

// ---------- recipes ----------

/** How a profile value is turned into the text the portal expects. */
export type RecipeTransform = 'none' | 'upper' | 'date' | 'amount' | 'yesNo' | 'nicDivision';

export type FieldControl = 'text' | 'select' | 'textarea' | 'radio';

export interface RecipeField {
  /** Profile key path, for example `company.proposedNames.0`. */
  key: string;
  /** The label the portal showed when the recipe was recorded. */
  label: string;
  /** AEM SOM expression, for example `guide[0].guide1[0].guideRootPanel[0].partA[0].proposedName1[0]`. */
  som?: string;
  /** CSS selector fallback for T0. */
  css?: string;
  /** The input's `name` when the recipe was recorded. */
  name?: string;
  control?: FieldControl;
  transform?: RecipeTransform;
  required?: boolean;
  /** The profile cannot supply it: the user answers it on the portal; the agent never types into it. */
  askUser?: boolean;
  note?: string;
  /**
   * A repeating template over this profile array (`directors`, `subscribers`). Its key holds
   * `[{i}]`; `{i}` (0-based) and `{n}` (1-based) in the key, SOM, CSS and label are replaced once per
   * entry by `expandRecipe` after the profile is loaded. An expanded field has no `each`.
   */
  each?: string;
}

/** Actions the engine knows. A recipe cannot add a new kind (SAFETY.md G15). */
export type RecipeActionKind = 'safe' | 'human';
export type SafeActionRole = 'save' | 'check' | 'download' | 'next' | 'attach';

export interface RecipeAction {
  id: string;
  kind: RecipeActionKind;
  /** For `safe` actions: what the engine uses it for. */
  role?: SafeActionRole;
  label: string;
  css?: string;
  /** The button's visible text, when the recipe finds it by text. */
  text?: string;
  /** Text that appears in `resultCss` (or the page) when the action worked (a regular expression source). */
  expectText?: string;
  resultCss?: string;
}

export type GateKind = 'LOGIN' | 'DSC' | 'SUBMIT' | 'PAY';

export interface RecipeGate {
  kind: GateKind;
  label: string;
  /** For SUBMIT and PAY: the button the overlay pulses with "You click this". Never clicked. */
  css?: string;
  text?: string;
}

export interface RecipePage {
  id: string;
  title: string;
  /** A glob on the page path (`*` any run, `?` one character); the engine fills only a matching page. */
  urlPattern: string;
  /** The same glob for the local mock portal, used instead of `urlPattern` on a mock host. */
  mockUrlPattern?: string;
  /** Selector that exists once the page is ready. */
  readyCss?: string;
  fields: RecipeField[];
}

export interface Recipe {
  id: string;
  version: string;
  title: string;
  pages: RecipePage[];
  actions: RecipeAction[];
  gates: RecipeGate[];
  /** CSS of the file input the signed PDF goes into. */
  attachCss?: string;
  expect: Array<{ kind: 'srn'; pattern: string }>;
}

/**
 * A recipe as delivered: Suite's JSON format (docs/specs/vcfo-assist-agents/API.md), which
 * `src/recipes/normalize.ts` turns into `Recipe`, plus its Ed25519 signature (base64) and the id of
 * the key that made it. `src/engine/recipe.ts` checks both before anything else.
 */
export interface SignedRecipe {
  recipe: unknown;
  sig: string;
  alg?: string;
  keyId?: string;
}

// ---------- catalog ----------

export interface CatalogSubAgent {
  id: string;
  name: string;
  /** The checklist step the run advances; "Fix in Suite" opens it when no missing entry names one. */
  stepId?: string;
  /** Absent while the sub-agent is not built yet ("Coming soon"). */
  recipeId?: string;
  form?: string;
}

export interface CatalogAgent {
  id: string;
  name: string;
  subAgents: CatalogSubAgent[];
}

export interface Catalog {
  /** False until the CS opinion is recorded in Suite. The extension treats a missing value as false. */
  liveAllowed: boolean;
  /** Hosts a live run may use once `liveAllowed` is true. */
  liveHosts?: string[];
  agents: CatalogAgent[];
}

// ---------- profile ----------

export interface ProfileMissing {
  key: string;
  label: string;
  stepId?: string;
  reason?: string;
}

/** The body of GET /api/engagements/:id/assist-profile. The profile is kept loose on purpose. */
export interface ProfileResult {
  schemaVersion: number;
  companyName: string;
  profile: Record<string, unknown>;
  missing: ProfileMissing[];
  notes?: Array<{ key: string; note: string }>;
}

export interface EngagementSummary {
  id: string;
  name: string;
  slug?: string;
}

// ---------- portal scan ----------

/** One form control on the portal page, as the scanner saw it. Never carries the control's value. */
export interface ScannedField {
  uid: string;
  tag: 'input' | 'select' | 'textarea' | 'radio';
  type: string;
  name: string;
  id: string;
  label: string;
  aria: string;
  placeholder: string;
  som: string | null;
  css: string;
  visible: boolean;
  section?: string;
  /** Select option or radio texts. Used to fill locally; never sent to the resolver. */
  options?: string[];
  /** Set when the guards refuse this control. */
  refused?: GuardRefusal | null;
}

export interface ScanResult {
  url: string;
  host: string;
  fields: ScannedField[];
  /** Recipe field key → uid of the control its SOM or CSS found (T0), or null. */
  probes: Record<string, string | null>;
  /** True while any login control (user id, password, captcha, OTP) is visible. */
  loginVisible: boolean;
  hasGuideBridge: boolean;
}

/** Enough to find a control again after a reload. */
export interface FieldTarget {
  uid: string;
  som: string | null;
  css: string;
  name: string;
}

// ---------- guards ----------

export type GuardCode = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';

export interface GuardRefusal {
  code: GuardCode;
  reason: string;
}

// ---------- heal ladder ----------

export type HealTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export interface ResolveCandidate {
  i: number;
  label: string;
  name?: string;
  aria?: string;
}

/** POST /api/assist/resolve. Labels and key names only (SAFETY.md G9). */
export interface ResolvePayload {
  fieldKey: string;
  fieldLabel: string;
  candidates: ResolveCandidate[];
}

export interface ResolveResponse {
  choice: number | null;
  tier: string;
  tokens: number;
  /** Model calls this answer cost (0 when Suite answered with its own rules). */
  aiCalls?: number;
}

/** POST /api/assist/patches. Labels only. */
export interface PatchProposal {
  recipeId: string;
  recipeVersion: string;
  fieldKey: string;
  sourceTier: 'T1' | 'T3' | 'T4';
  proposed: { som?: string; css?: string; label?: string };
  evidence: { fieldLabel?: string; chosenLabel?: string; note?: string };
  runId?: string;
}

// ---------- runs ----------

export const RUN_STATES = [
  'READY',
  'PULL_PROFILE',
  'WAIT_LOGIN',
  'FILL',
  'CHECK',
  'DOWNLOAD',
  'WAIT_DSC',
  'ATTACH',
  'RECHECK',
  'WAIT_SUBMIT_PAY',
  'READ_SRN',
  'WRITE_BACK',
  'DONE',
  'FAILED',
  'CANCELLED',
] as const;
export type RunState = (typeof RUN_STATES)[number];

export type FieldStatus = 'pending' | 'planned' | 'filled' | 'refused' | 'missing' | 'failed' | 'user';

export interface FieldOutcome {
  key: string;
  label: string;
  status: FieldStatus;
  tier?: HealTier;
  target?: FieldTarget;
  /** Shown in the confirm table only; held in the browser and never sent to Suite or the AI. */
  value?: string;
  foundLabel?: string;
  via?: 'guideBridge' | 'dom';
  note?: string;
}

export type WaitInfo =
  | { kind: 'login' }
  | { kind: 'confirm' }
  | { kind: 'teach'; fieldKey: string; label: string }
  | { kind: 'check_failed'; message: string; role: 'check' | 'recheck' }
  | { kind: 'dsc' }
  | { kind: 'submit_pay' }
  | { kind: 'live_blocked'; host: string }
  | { kind: 'wrong_page'; page: string; path: string }
  | { kind: 'suite_error'; message: string };

export interface LogEntry {
  t: number;
  kind: 'transition' | 'fill' | 'refusal' | 'heal' | 'gate' | 'ai' | 'suite' | 'info' | 'error';
  text: string;
}

export interface HealRecord {
  fieldKey: string;
  tier: HealTier;
  label: string;
}

export interface RefusalRecord {
  code: GuardCode;
  label: string;
  reason: string;
  t?: number;
}

export interface AttachedPdf {
  name: string;
  size: number;
  sha256: string;
}

export interface Run {
  id: string;
  suiteRunId?: string;
  engagementId: string;
  engagementName?: string;
  agentId: string;
  subAgentId: string;
  recipeId: string;
  recipeVersion: string;
  /** Where the recipe came from: Suite's registry or the copy shipped in the extension. */
  recipeFrom?: 'suite' | 'bundled';
  portalTabId: number;
  portalHost: string;
  state: RunState;
  wait?: WaitInfo;
  page: number;
  /** FILL sub-step: build the plan, wait for the user's confirmation (G13), then write. */
  phase?: 'plan' | 'confirm' | 'write';
  fields: FieldOutcome[];
  heals: HealRecord[];
  refusals: RefusalRecord[];
  aiCalls: number;
  aiTokens: number;
  srn?: string;
  pdf?: AttachedPdf;
  error?: string;
  log: LogEntry[];
  startedAt: number;
  updatedAt: number;
}
