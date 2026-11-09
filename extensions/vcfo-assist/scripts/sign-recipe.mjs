// Signs a recipe with the MOCK key (mock-portal/mock-signing-key.json) and prints the signature.
// A recipe signed this way runs only on mock hosts (src/engine/recipe.ts). Usage:
//   node scripts/sign-recipe.mjs src/recipes/spice-a.json   (then paste it into src/recipes/index.ts)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(',')}}`;
}

export async function signRecipe(recipe) {
  const { jwk } = JSON.parse(readFileSync(path.join(here, '../mock-portal/mock-signing-key.json'), 'utf8'));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(canonicalJson(recipe)));
  return Buffer.from(sig).toString('base64');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/sign-recipe.mjs <recipe.json>');
    process.exit(1);
  }
  process.stdout.write(`${await signRecipe(JSON.parse(readFileSync(file, 'utf8')))}\n`);
}
