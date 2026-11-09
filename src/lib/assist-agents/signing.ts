import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authSecrets } from '@/auth/secrets';
import { canonicalJson, type Recipe } from './recipe';

/**
 * RECIPE SIGNATURES — HMAC-SHA256 over the recipe's canonical JSON (`canonicalJson`), hex.
 *
 * The key is ASSIST_RECIPE_SECRET. Without it (local development) the key is derived from
 * AUTH_SECRET, so a fresh checkout works; production should set its own secret. The secret never
 * leaves the server: the extension checks integrity by asking Suite (`GET /api/assist/recipes/[id]`
 * returns `{ recipe, sig }` from a same-origin fetch), and caches the pair it received.
 */
function signingKey(env: Record<string, string | undefined> = process.env): Buffer {
  const own = env.ASSIST_RECIPE_SECRET?.trim();
  if (own) return Buffer.from(own, 'utf8');
  const [auth] = authSecrets(env);
  if (!auth) throw new Error('ASSIST_RECIPE_SECRET or AUTH_SECRET is required to sign recipes');
  return createHash('sha256').update(`vcfo-assist-recipe:${auth}`).digest();
}

export function signRecipe(recipe: Recipe, env?: Record<string, string | undefined>): string {
  return createHmac('sha256', signingKey(env)).update(canonicalJson(recipe)).digest('hex');
}

export function verifyRecipeSignature(recipe: Recipe, sig: string, env?: Record<string, string | undefined>): boolean {
  const expected = Buffer.from(signRecipe(recipe, env), 'hex');
  const got = Buffer.from(typeof sig === 'string' && /^[0-9a-f]+$/i.test(sig) ? sig : '', 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
