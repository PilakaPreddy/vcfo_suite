/**
 * Recipe checks (SAFETY.md G15). A recipe runs only when
 *   1. its signature verifies against a key built into the extension, and that key is allowed on
 *      the portal host (the mock key only on mock hosts), and
 *   2. its shape is one the engine knows: action kinds `safe | human`, gates human only, and no
 *      `safe` action whose label reads like Submit, Pay, Sign or Login.
 * Both checks run before any page is touched.
 */
import { isForbiddenAction } from '../guards';
import { isMockHost } from './live';
import type { Recipe, SignedRecipe } from '../shared/types';

/** Suite's own algorithm: a server-only HMAC the extension cannot check (API.md). */
export const SUITE_HMAC_ALG = 'HMAC-SHA256';

export interface TrustedKey {
  id: string;
  /** `mock`: valid only on mock hosts. `live`: valid anywhere the live switch allows. */
  scope: 'mock' | 'live';
  jwk: JsonWebKey;
}

/**
 * Built-in keys. The production key is added when Suite's recipe registry publishes it; until
 * then, Suite-served recipes verify only if Suite signs them with the mock key, and so run only on
 * the mock.
 */
export const TRUSTED_KEYS: TrustedKey[] = [
  {
    id: 'mock-2026-11',
    scope: 'mock',
    jwk: { kty: 'EC', crv: 'P-256', x: 'K5Qgch5dnJSIqSNi8xh8jXlhozUZMn-HL020YTW0vOY', y: 'lmfQBFwpJmp2Q0oUevWYFHqsqwPYB18J4ajrHBL5XXM', ext: true },
  },
];

/** JSON with sorted keys and no spaces: the bytes the signature covers. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

function b64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySignature(
  signed: SignedRecipe,
  host: string,
  keys: TrustedKey[] = TRUSTED_KEYS,
): Promise<{ ok: boolean; keyId?: string; reason?: string }> {
  if (!signed?.sig || !signed.recipe) return { ok: false, reason: 'recipe is not signed' };
  if (signed.alg === SUITE_HMAC_ALG) {
    // An HMAC with a server-only key proves nothing to the extension. It came over the signed-in
    // Suite tab, which is enough for the mock; a live host needs a public-key signature (G15).
    if (isMockHost(host)) return { ok: true, keyId: 'suite-hmac (mock hosts only)' };
    return { ok: false, reason: `Suite's HMAC signature cannot be checked by the extension, so it is not accepted on ${host}` };
  }
  let sig: Uint8Array;
  try {
    sig = b64ToBytes(signed.sig);
  } catch {
    return { ok: false, reason: 'signature is not base64' };
  }
  const data = new TextEncoder().encode(canonicalJson(signed.recipe));
  for (const key of keys) {
    try {
      const k = await crypto.subtle.importKey('jwk', key.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig as BufferSource, data as BufferSource);
      if (!good) continue;
      if (key.scope === 'mock' && !isMockHost(host)) {
        return { ok: false, reason: `recipe is signed with the mock key, which is not valid on ${host}` };
      }
      return { ok: true, keyId: key.id };
    } catch {
      // A key that cannot be imported is skipped.
    }
  }
  return { ok: false, reason: 'signature does not match any built-in key' };
}

const KINDS = new Set(['safe', 'human']);
const ROLES = new Set(['save', 'check', 'download', 'next', 'attach']);
const GATES = new Set(['LOGIN', 'DSC', 'SUBMIT', 'PAY']);
const TRANSFORMS = new Set(['none', 'upper', 'date', 'amount', 'yesNo', 'nicDivision']);
const CONTROLS = new Set(['text', 'select', 'textarea', 'radio']);

/** Shape check. Returns the problems; an empty list means the engine knows every part. */
export function validateRecipe(r: Recipe): string[] {
  const problems: string[] = [];
  if (!r || typeof r !== 'object') return ['recipe is not an object'];
  if (!r.id || !r.version) problems.push('recipe has no id or version');
  if (!Array.isArray(r.pages) || !r.pages.length) problems.push('recipe has no pages');
  for (const p of r.pages ?? []) {
    try {
      new RegExp(p.urlPattern);
    } catch {
      problems.push(`page ${p.id}: urlPattern is not a regular expression`);
    }
    for (const f of p.fields ?? []) {
      if (!f.key || !f.label) problems.push(`page ${p.id}: a field has no key or label`);
      if (f.transform && !TRANSFORMS.has(f.transform)) problems.push(`field ${f.key}: unknown transform ${f.transform}`);
      if (f.control && !CONTROLS.has(f.control)) problems.push(`field ${f.key}: unknown control ${f.control}`);
    }
  }
  for (const a of r.actions ?? []) {
    if (!KINDS.has(a.kind)) problems.push(`action ${a.id}: unknown kind ${String(a.kind)}`);
    if (!a.css && !a.text) problems.push(`action ${a.id}: no selector and no text`);
    if (a.kind === 'safe') {
      // A safe action with no recognised role is kept but never clicked.
      if (a.role && !ROLES.has(a.role)) problems.push(`action ${a.id}: unknown role ${String(a.role)}`);
      const forbidden = isForbiddenAction({ text: `${a.label} ${a.text ?? ''}`, id: a.id });
      if (forbidden) problems.push(`action ${a.id}: a safe action may not be "${a.label}" (${forbidden.code})`);
    }
  }
  for (const g of r.gates ?? []) {
    if (!GATES.has(g.kind)) problems.push(`gate ${String(g.kind)} is unknown`);
  }
  for (const e of r.expect ?? []) {
    if (e.kind !== 'srn') problems.push(`expect ${String(e.kind)} is unknown`);
  }
  return problems;
}
