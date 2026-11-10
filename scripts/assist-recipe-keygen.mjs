// Prints a new Ed25519 key pair for signing VCFO Assist recipes (docs/specs/vcfo-assist-agents/API.md).
//
//   node scripts/assist-recipe-keygen.mjs [keyId]
//
// The private key goes into ASSIST_RECIPE_PRIVATE_KEY (Secrets Manager in AWS, .env.local locally)
// and the key id into ASSIST_RECIPE_KEY_ID (default "prod"). The public key goes into the
// extension's key map, `RECIPE_PUBLIC_KEYS` in extensions/vcfo-assist/src/engine/recipe.ts, under the
// same key id. Nothing is written to disk: copy the output, then clear the terminal.
import { generateKeyPairSync } from 'node:crypto';

const keyId = process.argv[2]?.trim() || 'prod';
if (keyId === 'dev') {
  console.error('"dev" is the built-in mock-only key id; pick another, for example "prod" or "prod-2027".');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const raw = publicKey.export({ format: 'jwk' }).x;

console.log(`# Key id: ${keyId}`);
console.log('');
console.log('# Suite (server only). The PEM may also be given on one line with literal \\n.');
console.log(`ASSIST_RECIPE_KEY_ID=${keyId}`);
console.log(`ASSIST_RECIPE_PRIVATE_KEY="${pem.trim().replace(/\n/g, '\\n')}"`);
console.log('');
console.log('# Extension: RECIPE_PUBLIC_KEYS in extensions/vcfo-assist/src/engine/recipe.ts');
console.log(`'${keyId}': '${raw}',`);
