import { describe, expect, it } from 'vitest';
import spiceA from './recipes/spice-a.json';
import { canonicalJson, parseRecipe, recipeSchema } from './recipe';
import { MOCK_SPICE_A_FIELD_NAMES, mockSomPath } from './mock-fields';
import { getRecipe, listRecipes } from './registry';
import { signRecipe, verifyRecipeSignature } from './signing';

const ENV = { AUTH_SECRET: 'test-auth-secret' };

describe('spice-a recipe', () => {
  const recipe = parseRecipe(spiceA);

  it('parses against the schema as v1.0.0, checked against the mock', () => {
    expect(recipe.id).toBe('spice-a');
    expect(recipe.version).toBe('1.0.0');
    expect(recipe.verifiedAgainst).toBe('mock');
    expect(recipe.gates).toEqual(expect.arrayContaining(['LOGIN', 'SUBMIT', 'PAY']));
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
    expect(getRecipe('spice-a')?.version).toBe('1.0.0');
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

describe('canonical JSON and the signature', () => {
  const recipe = parseRecipe(spiceA);

  it('sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it('signs and verifies, and a changed recipe fails', () => {
    const sig = signRecipe(recipe, ENV);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyRecipeSignature(recipe, sig, ENV)).toBe(true);
    const tampered = { ...recipe, fields: recipe.fields.map((f, i) => (i === 0 ? { ...f, som: 'evil' } : f)) };
    expect(verifyRecipeSignature(tampered, sig, ENV)).toBe(false);
    expect(verifyRecipeSignature(recipe, 'not-hex', ENV)).toBe(false);
  });

  it('prefers ASSIST_RECIPE_SECRET over the AUTH_SECRET fallback', () => {
    expect(signRecipe(recipe, { ...ENV, ASSIST_RECIPE_SECRET: 'own' })).not.toBe(signRecipe(recipe, ENV));
  });

  it('throws without any secret', () => {
    expect(() => signRecipe(recipe, {})).toThrow(/ASSIST_RECIPE_SECRET/);
  });
});
