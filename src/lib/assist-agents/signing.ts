import 'server-only';

import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { canonicalJson, type Recipe } from './recipe';

/**
 * RECIPE SIGNATURES — Ed25519 over the UTF-8 bytes of the recipe's canonical JSON
 * (`canonicalJson`), base64. The extension verifies them with WebCrypto against public keys built
 * into it (`extensions/vcfo-assist/src/engine/recipe.ts`), so a recipe altered on the way, or in
 * the extension's cache, is refused before any page is touched (SAFETY.md G15).
 *
 * Keys:
 *   - `ASSIST_RECIPE_PRIVATE_KEY` (PEM, PKCS#8) signs with key id `ASSIST_RECIPE_KEY_ID`, `prod` by
 *     default. `node scripts/assist-recipe-keygen.mjs` prints a new pair. The extension accepts a
 *     prod signature on any host the live switch allows, once the public key is built into it.
 *   - Without it, the signature uses the DEV key, derived from a fixed seed in this file, and says
 *     `keyId: 'dev'`. The seed is public, so anyone can make a dev signature: the extension
 *     accepts `dev` on its mock hosts only. This keeps a fresh checkout working and is safe in
 *     production too (live hosts refuse it).
 */

export const RECIPE_SIG_ALG = 'ed25519';
export const DEV_KEY_ID = 'dev';

/** The fixed seed of the dev key. Changing it changes the dev public key the extension ships. */
const DEV_SEED = createHash('sha256').update('vcfo-assist-recipe-dev-key-v1').digest();
/** PKCS#8 DER prefix for a raw 32-byte Ed25519 private key (RFC 8410). */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface RecipeSigner {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

let devSigner: RecipeSigner | null = null;

export function devRecipeSigner(): RecipeSigner {
  if (!devSigner) {
    const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, DEV_SEED]), format: 'der', type: 'pkcs8' });
    devSigner = { keyId: DEV_KEY_ID, privateKey, publicKey: createPublicKey(privateKey) };
  }
  return devSigner;
}

/** The signer for this environment: the configured key, or the dev key when none is set. */
export function recipeSigner(env: Record<string, string | undefined> = process.env): RecipeSigner {
  // Secrets Manager and .env files often carry the PEM with literal "\n".
  const pem = env.ASSIST_RECIPE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
  if (!pem) return devRecipeSigner();
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('ASSIST_RECIPE_PRIVATE_KEY must be an Ed25519 private key (PEM)');
  const keyId = env.ASSIST_RECIPE_KEY_ID?.trim() || 'prod';
  if (keyId === DEV_KEY_ID) throw new Error('ASSIST_RECIPE_KEY_ID may not be "dev"');
  return { keyId, privateKey, publicKey: createPublicKey(privateKey) };
}

/** The raw 32-byte public key, base64url: the form the extension's key map holds. */
export function rawPublicKey(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('not an Ed25519 public key');
  return jwk.x;
}

export interface SignedRecipeBody {
  recipe: Recipe;
  sig: string;
  alg: typeof RECIPE_SIG_ALG;
  keyId: string;
}

export function signRecipe(recipe: Recipe, env?: Record<string, string | undefined>): SignedRecipeBody {
  const signer = recipeSigner(env);
  const sig = sign(null, Buffer.from(canonicalJson(recipe), 'utf8'), signer.privateKey).toString('base64');
  return { recipe, sig, alg: RECIPE_SIG_ALG, keyId: signer.keyId };
}

export function verifyRecipeSignature(recipe: unknown, sig: string, publicKey: KeyObject): boolean {
  if (typeof sig !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(sig)) return false;
  try {
    return verify(null, Buffer.from(canonicalJson(recipe), 'utf8'), publicKey, Buffer.from(sig, 'base64'));
  } catch {
    return false;
  }
}
