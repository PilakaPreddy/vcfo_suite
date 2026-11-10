/**
 * One recipe source. The bundled recipes are generated from Suite's registry
 * (`src/lib/assist-agents/recipes/*.json`) by Suite's `scripts/assist-recipes-bundle.ts`; this test
 * fails when they drift, when the dev key here differs from the one Suite signs with, or when a mock
 * page stops carrying the field names Suite's recipes are built from (`mock-fields.ts`). Skipped
 * when the extension is built outside the Suite repository; excluded from this package's `tsc`
 * because it imports Suite's sources.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import bundle from './bundled.json';
import { RECIPE_PUBLIC_KEYS, canonicalJson, verifySignature } from '../engine/recipe';

const SUITE_RECIPES = path.resolve(__dirname, '../../../../src/lib/assist-agents/recipes');
const MOCK_DIR = path.resolve(__dirname, '../../mock-portal');
const present = existsSync(SUITE_RECIPES);

describe('bundled recipes', () => {
  it('ship the dev key the extension trusts, and every bundled recipe verifies with it', async () => {
    expect(bundle.devPublicKey).toBe(RECIPE_PUBLIC_KEYS.dev);
    for (const signed of Object.values(bundle.recipes)) expect((await verifySignature(signed, 'localhost')).ok).toBe(true);
  });
});

describe.skipIf(!present)("bundled recipes match Suite's registry", async () => {
  const { recipeSchema } = await import('../../../../src/lib/assist-agents/recipe');
  const mockFields = await import('../../../../src/lib/assist-agents/mock-fields');
  const files = present ? readdirSync(SUITE_RECIPES).filter((f) => f.endsWith('.json')) : [];

  it("holds exactly Suite's recipes, byte for byte (rerun scripts/assist-recipes-bundle.ts in Suite)", () => {
    const suite = Object.fromEntries(files.map((f) => JSON.parse(readFileSync(path.join(SUITE_RECIPES, f), 'utf8'))).map((r) => [r.id, r]));
    expect(Object.keys(bundle.recipes).sort()).toEqual(Object.keys(suite).sort());
    for (const [id, signed] of Object.entries(bundle.recipes)) {
      expect(canonicalJson(signed.recipe), id).toBe(canonicalJson(recipeSchema.parse(suite[id])));
    }
  });

  it('mock pages carry every field Suite builds the recipes from', () => {
    const a = readFileSync(path.join(MOCK_DIR, 'spice-a.html'), 'utf8');
    for (const name of mockFields.MOCK_SPICE_A_FIELD_NAMES) expect(a).toContain(`data-som="${mockFields.mockSomPath(name)}"`);
    const b = readFileSync(path.join(MOCK_DIR, 'spice-b.html'), 'utf8');
    for (const name of mockFields.MOCK_SPICE_B_FIELD_NAMES) {
      expect(b).toContain(`data-som="${mockFields.mockSpiceBSomPath(name)}"`);
      expect(b).toContain(`name="${name}"`);
    }
    for (const group of ['subscribers', 'directors'] as const) {
      for (let i = 0; i < mockFields.MOCK_SPICE_B_BLOCKS; i += 1) {
        for (const field of mockFields.MOCK_SPICE_B_GROUPS[group].fields) {
          expect(b).toContain(`data-som="${mockFields.mockSpiceBGroupSomPath(group, field, i)}"`);
          expect(b).toContain(`name="${mockFields.mockSpiceBGroupName(group, field, i + 1)}"`);
        }
      }
    }
  });
});
