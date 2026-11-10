/**
 * Suite's recipe format (src/lib/assist-agents/recipe.ts in Suite; API.md "GET /api/assist/recipes")
 * → the engine's `Recipe`. The signature is checked on the raw JSON first; this runs after.
 *
 * Suite's format names actions by `match: { som?, css?, text? }` and has no roles, so the role of a
 * `safe` action is read from its id and label (save, check, download, next, attach). A safe action
 * whose purpose is not recognised gets no role and is never clicked. The engine's own checks
 * (`validateRecipe`) still run on the result.
 */
import type { GateKind, Recipe, RecipeAction, RecipeField, RecipeGate, RecipeTransform, SafeActionRole } from '../shared/types';

interface SuiteMatch {
  som?: string;
  css?: string;
  text?: string;
}

interface SuiteRecipe {
  id: string;
  version: string;
  title: string;
  subAgent?: string;
  verifiedAgainst?: string;
  pages: Array<{ id: string; title: string; urlPattern: string; mockUrlPattern?: string; ready?: SuiteMatch }>;
  fields: Array<{ key: string; page?: string; som: string; css?: string; label: string; transform?: string; required?: boolean; askUser?: boolean; note?: string; each?: string }>;
  actions: Array<{ id: string; label: string; kind: string; match: SuiteMatch }>;
  gates: string[];
  expect: Array<{ id: string; kind: string; pattern: string }>;
}

const TRANSFORMS: Record<string, RecipeTransform> = {
  none: 'none',
  toMcaDate: 'date',
  rupeeAmount: 'amount',
  // The profile already holds MCA list words (Suite's vocabulary.ts runs in the profile builder).
  vocabulary: 'none',
  nicDivision: 'nicDivision',
  yesNo: 'yesNo',
  upper: 'upper',
};

const GATE_LABELS: Record<GateKind, string> = {
  LOGIN: 'Log in to the portal yourself (user ID, password, captcha and OTP).',
  DSC: 'Sign the downloaded PDF with your DSC, then drop it here.',
  SUBMIT: 'Click Submit yourself.',
  PAY: 'Pay the fee yourself.',
};

function roleOf(id: string, label: string): SafeActionRole | undefined {
  const words = `${id} ${label}`.toLowerCase();
  if (/attach|upload/.test(words)) return 'attach';
  if (/check|validate|verify/.test(words)) return 'check';
  if (/download|pdf/.test(words)) return 'download';
  if (/save|draft/.test(words)) return 'save';
  if (/next|continue/.test(words)) return 'next';
  return undefined;
}

/** `[name="director1Din"]` → `director1Din`: the control's name when the recipe's selector names it. */
export function nameFromCss(css: string | undefined): string | undefined {
  const m = /^\[name=(?:"([^"]+)"|'([^']+)'|([\w.-]+))\]$/.exec((css ?? '').trim());
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** `guide[0]...proposedName1[0]` → `proposedName1`: an AEM node's name is the last SOM step. */
export function nameFromSom(som: string | undefined): string | undefined {
  const m = /\.?([A-Za-z_][\w]*)\[\d+\]$/.exec(som ?? '');
  return m?.[1];
}

function isSuiteRecipe(raw: unknown): raw is SuiteRecipe {
  const r = raw as SuiteRecipe;
  return Boolean(r) && typeof r === 'object' && Array.isArray(r.pages) && Array.isArray(r.fields) && Array.isArray(r.actions) && Array.isArray(r.gates);
}

/** Throws when the JSON is not a Suite-format recipe. */
export function normalizeRecipe(raw: unknown): Recipe {
  if (!isSuiteRecipe(raw)) throw new Error('recipe is not in the Suite format');
  const firstPage = raw.pages[0]?.id;
  const expectFor = (re: RegExp) => raw.expect.find((e) => e.kind === 'text' && re.test(e.id))?.pattern;

  const pages = raw.pages.map((p) => ({
    id: p.id,
    title: p.title,
    urlPattern: p.urlPattern,
    mockUrlPattern: p.mockUrlPattern,
    readyCss: p.ready?.css,
    fields: [] as RecipeField[],
  }));
  for (const f of raw.fields) {
    const page = pages.find((p) => p.id === (f.page ?? firstPage)) ?? pages[0];
    page?.fields.push({
      key: f.key,
      label: f.label,
      som: f.som,
      css: f.css,
      name: nameFromCss(f.css) ?? nameFromSom(f.som),
      transform: (f.transform ? TRANSFORMS[f.transform] ?? f.transform : 'none') as RecipeTransform,
      required: f.required,
      askUser: f.askUser,
      note: f.note,
      each: f.each,
    });
  }

  const actions: RecipeAction[] = [];
  let attachCss: string | undefined;
  for (const a of raw.actions) {
    const role = a.kind === 'safe' ? roleOf(a.id, a.label) : undefined;
    if (role === 'attach') {
      attachCss = a.match.css;
      continue;
    }
    actions.push({
      id: a.id,
      kind: a.kind as RecipeAction['kind'],
      role,
      label: a.label,
      css: a.match.css,
      text: a.match.text,
      expectText: role === 'check' ? expectFor(/check/) : role === 'download' ? expectFor(/pdf|download/) : role === 'save' ? expectFor(/save/) : undefined,
    });
  }

  const humanFor = (re: RegExp) => raw.actions.find((a) => a.kind === 'human' && re.test(`${a.id} ${a.label}`.toLowerCase()));
  const gates: RecipeGate[] = raw.gates.map((g) => {
    const kind = g as GateKind;
    const button = kind === 'SUBMIT' ? humanFor(/submit/) : kind === 'PAY' ? humanFor(/pay/) : undefined;
    return { kind, label: GATE_LABELS[kind] ?? String(g), css: button?.match.css, text: button?.match.text };
  });

  return {
    id: raw.id,
    version: raw.version,
    title: raw.title,
    pages,
    actions,
    gates,
    attachCss,
    expect: raw.expect.filter((e) => e.kind === 'srn').map((e) => ({ kind: 'srn' as const, pattern: e.pattern })),
  };
}
