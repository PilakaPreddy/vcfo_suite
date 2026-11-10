import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import spiceA from './recipes/spice-a.json';
import spiceB from './recipes/spice-b.json';
import { canonicalJson, findRecipeField, parseRecipe, recipeSchema } from './recipe';
import {
  MOCK_SPICE_A_FIELD_NAMES,
  MOCK_SPICE_B_FIELD_NAMES,
  MOCK_SPICE_B_GROUPS,
  mockSomPath,
  mockSpiceBGroupName,
  mockSpiceBGroupSomPath,
  mockSpiceBSomPath,
} from './mock-fields';
import { getRecipe, listRecipes } from './registry';
import { DEV_KEY_ID, devRecipeSigner, rawPublicKey, recipeSigner, signRecipe, verifyRecipeSignature } from './signing';
import { createPublicKey } from 'node:crypto';

describe('spice-a recipe', () => {
  const recipe = parseRecipe(spiceA);

  it('parses against the schema as v1.1.0, checked against the mock', () => {
    expect(recipe.id).toBe('spice-a');
    expect(recipe.version).toBe('1.1.0');
    expect(recipe.verifiedAgainst).toBe('mock');
    expect(recipe.gates).toEqual(['LOGIN', 'DSC', 'SUBMIT', 'PAY']);
    expect(recipe.pages[0]?.mockUrlPattern).toBe('/spice-a*.html');
  });

  it('carries the mock flow: Save, Check form, Download PDF and Attach PDF are safe; no safe label says sign', () => {
    const safe = recipe.actions.filter((a) => a.kind === 'safe');
    expect(safe.map((a) => a.id)).toEqual(['save-draft', 'check-form', 'download-pdf', 'attach-pdf']);
    expect(safe.find((a) => a.id === 'attach-pdf')?.match.css).toBe('#signed-pdf');
    for (const action of safe) expect(`${action.id} ${action.label}`).not.toMatch(/sign/i);
  });

  it('uses every mock field name exactly once, through the mock SOM convention', () => {
    const names = recipe.fields.map((f) => f.som.match(/guideRootPanel\[0\]\.(\w+)\[0\]$/)?.[1]);
    expect([...names].sort()).toEqual([...MOCK_SPICE_A_FIELD_NAMES].sort());
    for (const field of recipe.fields) {
      const name = field.som.match(/\.(\w+)\[0\]$/)![1] as (typeof MOCK_SPICE_A_FIELD_NAMES)[number];
      expect(field.som).toBe(mockSomPath(name));
    }
  });

  it('reads profile keys only, never a value', () => {
    for (const field of recipe.fields) expect(field.key.startsWith('company.')).toBe(true);
    expect(JSON.stringify(recipe)).not.toMatch(/"value"/);
  });

  it('never lets the agent click Submit or Pay', () => {
    const submit = recipe.actions.filter((a) => /submit|pay/i.test(a.label));
    expect(submit.length).toBeGreaterThan(0);
    for (const action of submit) expect(action.kind).toBe('human');
  });

  it('has an SRN pattern that finds an MCA reference', () => {
    const srn = recipe.expect.find((e) => e.kind === 'srn')!;
    expect('Your SRN is AA1234567 for this form'.match(new RegExp(srn.pattern))?.[0]).toBe('AA1234567');
  });

  it('is served by the registry', () => {
    expect(getRecipe('spice-a')?.version).toBe('1.1.0');
    expect(getRecipe('nope')).toBeNull();
    expect(listRecipes().map((r) => r.id)).toContain('spice-a');
  });
});

describe('recipe schema', () => {
  const base = parseRecipe(spiceA);

  it('refuses a safe Submit action', () => {
    const bad = { ...base, actions: [{ id: 'submit', label: 'Submit', kind: 'safe', match: { text: 'Submit' } }] };
    expect(recipeSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses duplicate field keys, unknown pages and a bad version', () => {
    expect(recipeSchema.safeParse({ ...base, fields: [base.fields[0], base.fields[0]] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...base, fields: [{ ...base.fields[0], page: 'other' }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...base, version: '1.0' }).success).toBe(false);
  });

  it('refuses unknown keys, so a recipe cannot smuggle a value in', () => {
    expect(recipeSchema.safeParse({ ...base, fields: [{ ...base.fields[0], value: 'X' }] }).success).toBe(false);
  });
});

describe('spice-b recipe', () => {
  const recipe = parseRecipe(spiceB);

  it('parses as v1.0.0 against the mock and is served by the registry', () => {
    expect(recipe).toMatchObject({ id: 'spice-b', version: '1.0.0', subAgent: 'spice-b', verifiedAgainst: 'mock' });
    expect(getRecipe('spice-b')?.fields).toHaveLength(recipe.fields.length);
    expect(recipe.gates).toEqual(['LOGIN', 'DSC', 'SUBMIT', 'PAY']);
  });

  it('fills company, registered office, subscribers[] and directors[] through the mock field names', () => {
    const singles = recipe.fields.filter((f) => !f.each);
    expect(singles.map((f) => f.som).sort()).toEqual(MOCK_SPICE_B_FIELD_NAMES.map(mockSpiceBSomPath).sort());
    for (const f of singles) expect(f.key).toMatch(/^(company|registeredOffice)\./);
    for (const group of ['subscribers', 'directors'] as const) {
      const fields = recipe.fields.filter((f) => f.each === group);
      const names = MOCK_SPICE_B_GROUPS[group].fields;
      expect(fields.map((f) => f.som).sort()).toEqual(names.map((n) => mockSpiceBGroupSomPath(group, n, '{i}')).sort());
      expect(fields.map((f) => f.css).sort()).toEqual(names.map((n) => `[name="${mockSpiceBGroupName(group, n, '{n}')}"]`).sort());
      for (const f of fields) {
        expect(f.key.startsWith(`${group}[{i}].`)).toBe(true);
        expect(f.label).toContain('{n}');
      }
    }
  });

  it('leaves the director designation to the user (Suite does not hold it)', () => {
    expect(recipe.fields.find((f) => f.key === 'directors[{i}].designation')?.askUser).toBe(true);
  });

  it('finds the template for a concrete repeating key', () => {
    expect(findRecipeField(recipe, 'directors[1].din')?.key).toBe('directors[{i}].din');
    expect(findRecipeField(recipe, 'subscribers[0].shares.equity.number')?.key).toBe('subscribers[{i}].shares.equity.number');
    expect(findRecipeField(recipe, 'registeredOffice.pincode')?.key).toBe('registeredOffice.pincode');
    expect(findRecipeField(recipe, 'directors[x].din')).toBeNull();
    expect(findRecipeField(recipe, 'directors[1].nope')).toBeNull();
  });
});

describe('repeating fields (each)', () => {
  const base = parseRecipe(spiceB);
  const template = base.fields.find((f) => f.each === 'directors')!;

  it('needs the key to start with the array and {i}, and a placeholder in the SOM path', () => {
    expect(recipeSchema.safeParse({ ...base, fields: [{ ...template, key: 'directors[0].firstName' }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...base, fields: [{ ...template, som: 'a[0].director[0].firstName[0]' }] }).success).toBe(false);
  });

  it('refuses a placeholder on a field without each', () => {
    const { each: _each, ...plain } = template;
    expect(recipeSchema.safeParse({ ...base, fields: [plain] }).success).toBe(false);
  });
});

describe('canonical JSON', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});

describe('Ed25519 recipe signatures', () => {
  const recipe = parseRecipe(spiceA);
  const pair = generateKeyPairSync('ed25519');
  const PROD = { ASSIST_RECIPE_PRIVATE_KEY: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() };

  it('signs with the dev key when no private key is set, deterministically', () => {
    const signed = signRecipe(recipe, {});
    expect(signed).toMatchObject({ alg: 'ed25519', keyId: DEV_KEY_ID });
    expect(Buffer.from(signed.sig, 'base64')).toHaveLength(64);
    expect(signRecipe(recipe, {}).sig).toBe(signed.sig);
    expect(verifyRecipeSignature(recipe, signed.sig, devRecipeSigner().publicKey)).toBe(true);
  });

  it('signs with ASSIST_RECIPE_PRIVATE_KEY as "prod", or its own key id, and the dev key cannot verify it', () => {
    const signed = signRecipe(recipe, PROD);
    expect(signed.keyId).toBe('prod');
    expect(verifyRecipeSignature(recipe, signed.sig, pair.publicKey)).toBe(true);
    expect(verifyRecipeSignature(recipe, signed.sig, devRecipeSigner().publicKey)).toBe(false);
    expect(signRecipe(recipe, { ...PROD, ASSIST_RECIPE_KEY_ID: 'prod-2027' }).keyId).toBe('prod-2027');
  });

  it('reads a PEM given on one line with literal \\n', () => {
    const oneLine = PROD.ASSIST_RECIPE_PRIVATE_KEY.trim().replace(/\n/g, '\\n');
    expect(rawPublicKey(recipeSigner({ ASSIST_RECIPE_PRIVATE_KEY: oneLine }).publicKey)).toBe(rawPublicKey(pair.publicKey));
  });

  it('refuses a non-Ed25519 key and the reserved dev key id', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    expect(() => signRecipe(recipe, { ASSIST_RECIPE_PRIVATE_KEY: ec })).toThrow(/Ed25519/);
    expect(() => signRecipe(recipe, { ...PROD, ASSIST_RECIPE_KEY_ID: 'dev' })).toThrow(/dev/);
  });

  it('fails on one changed byte and on a malformed signature', () => {
    const { sig } = signRecipe(recipe, {});
    const key = devRecipeSigner().publicKey;
    const tampered = { ...recipe, fields: recipe.fields.map((f, i) => (i === 0 ? { ...f, som: 'evil' } : f)) };
    expect(verifyRecipeSignature(tampered, sig, key)).toBe(false);
    expect(verifyRecipeSignature(recipe, 'not base64!', key)).toBe(false);
    expect(verifyRecipeSignature(recipe, Buffer.alloc(64).toString('base64'), key)).toBe(false);
  });
});

/**
 * One recipe source: the extension ships `src/recipes/bundled.json`, which
 * `scripts/assist-recipes-bundle.ts` writes from this registry. This fails when they drift.
 */
describe('the extension bundle matches the registry', () => {
  const root = path.resolve(__dirname, '../../..');
  const bundle = JSON.parse(readFileSync(path.join(root, 'extensions/vcfo-assist/src/recipes/bundled.json'), 'utf8')) as {
    devPublicKey: string;
    recipes: Record<string, { recipe: unknown; sig: string; alg: string; keyId: string }>;
  };
  const extensionKeys = readFileSync(path.join(root, 'extensions/vcfo-assist/src/engine/recipe.ts'), 'utf8');
  const devKey = rawPublicKey(devRecipeSigner().publicKey);

  it('holds every registry recipe, byte for byte, with the dev signature Suite makes', () => {
    expect(Object.keys(bundle.recipes).sort()).toEqual(listRecipes().map((r) => r.id).sort());
    for (const recipe of listRecipes()) {
      const entry = bundle.recipes[recipe.id]!;
      expect(canonicalJson(entry.recipe), `${recipe.id}: rerun scripts/assist-recipes-bundle.ts`).toBe(canonicalJson(recipe));
      expect(entry).toMatchObject({ alg: 'ed25519', keyId: 'dev', sig: signRecipe(recipe, {}).sig });
    }
  });

  it("names Suite's dev public key, and the extension's key map holds the same key", () => {
    expect(bundle.devPublicKey).toBe(devKey);
    expect(extensionKeys).toContain(`dev: '${devKey}'`);
    expect(createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: devKey }, format: 'jwk' }).equals(devRecipeSigner().publicKey)).toBe(true);
  });
});
