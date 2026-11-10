/**
 * Recipe checks (SAFETY.md G15). A recipe runs only when
 *   1. its Ed25519 signature verifies against a public key built into the extension
 *      (`RECIPE_PUBLIC_KEYS`), and that key is allowed on the portal host: `dev` only on mock
 *      hosts, any other key wherever the live switch allows; and
 *   2. its shape is one the engine knows: action kinds `safe | human`, gates human only, and no
 *      `safe` action whose label reads like Submit, Pay, Sign or Login.
 * Both checks run before any page is touched. An unknown key id or a bad signature is refused.
 */
import { isForbiddenAction } from '../guards';
import { isMockHost } from './live';
import type { Recipe, SignedRecipe } from '../shared/types';

/** Suite's signature algorithm (API.md, `GET /api/assist/recipes/[id]`). */
export const RECIPE_SIG_ALG = 'ed25519';

/**
 * Recipe public keys by key id: raw 32-byte Ed25519 keys, base64url. `dev` is Suite's built-in
 * development key; its seed is public, so it is valid on mock hosts only. `prod` stays null until
 * the owner creates the production pair (`node scripts/assist-recipe-keygen.mjs` in Suite) and
 * pastes its public key here; until then a prod-signed recipe is refused as an unknown key.
 */
export const RECIPE_PUBLIC_KEYS: Readonly<Record<string, string | null>> = {
  dev: 'P-KGuglzCZ0GFMMm2aV1m-v7nd1_4BHVyE8g4Nvy9Mc',
  prod: null,
};

/** The key id that is accepted on mock hosts only. */
export const DEV_KEY_ID = 'dev';

/** JSON with sorted keys and no spaces: the bytes the signature covers (same as Suite's `canonicalJson`). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

function b64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new Error('not base64');
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySignature(
  signed: SignedRecipe,
  host: string,
  keys: Readonly<Record<string, string | null>> = RECIPE_PUBLIC_KEYS,
): Promise<{ ok: boolean; keyId?: string; reason?: string }> {
  if (!signed?.sig || !signed.recipe) return { ok: false, reason: 'recipe is not signed' };
  if ((signed.alg ?? '').toLowerCase() !== RECIPE_SIG_ALG) return { ok: false, reason: `signature algorithm ${signed.alg ?? '(none)'} is not ${RECIPE_SIG_ALG}` };
  const keyId = signed.keyId ?? '';
  const raw = Object.prototype.hasOwnProperty.call(keys, keyId) ? keys[keyId] : null;
  if (!raw) return { ok: false, reason: `signing key "${keyId || '(none)'}" is not built into the extension` };
  // Checked before the signature, so a dev-signed recipe never counts as verified on a live host.
  if (keyId === DEV_KEY_ID && !isMockHost(host)) return { ok: false, reason: `recipe is signed with the dev key, which is valid on mock hosts only, not on ${host}` };
  let sig: Uint8Array;
  try {
    sig = b64ToBytes(signed.sig);
  } catch {
    return { ok: false, reason: 'signature is not base64' };
  }
  try {
    const key = await crypto.subtle.importKey('raw', b64ToBytes(raw) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    const data = new TextEncoder().encode(canonicalJson(signed.recipe));
    const good = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig as BufferSource, data as BufferSource);
    return good ? { ok: true, keyId } : { ok: false, reason: `signature does not match key "${keyId}"` };
  } catch (err) {
    return { ok: false, reason: `signature could not be checked (${(err as Error).message})` };
  }
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
    if (typeof p.urlPattern !== 'string' || !p.urlPattern.startsWith('/')) problems.push(`page ${p.id}: urlPattern must be a path glob`);
    if (p.mockUrlPattern !== undefined && (typeof p.mockUrlPattern !== 'string' || !p.mockUrlPattern.startsWith('/'))) problems.push(`page ${p.id}: mockUrlPattern must be a path glob`);
    for (const f of p.fields ?? []) {
      if (!f.key || !f.label) problems.push(`page ${p.id}: a field has no key or label`);
      if (f.transform && !TRANSFORMS.has(f.transform)) problems.push(`field ${f.key}: unknown transform ${f.transform}`);
      if (f.control && !CONTROLS.has(f.control)) problems.push(`field ${f.key}: unknown control ${f.control}`);
      if (f.each !== undefined && (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(f.each) || !f.key.startsWith(`${f.each}[{i}].`))) {
        problems.push(`field ${f.key}: a repeating field must read "${f.each}[{i}].…"`);
      }
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
