import spiceA from './recipes/spice-a.json';
import spiceB from './recipes/spice-b.json';
import { parseRecipe, type Recipe } from './recipe';

/**
 * The recipe registry: every recipe file, parsed once against the schema. A recipe is code, so a
 * change ships with a deploy and its version must be bumped (an approved patch is applied by a
 * person editing the JSON and bumping the version; the patch row records what to change).
 */
const RECIPE_FILES: readonly unknown[] = [spiceA, spiceB];

let cache: Map<string, Recipe> | null = null;

function recipes(): Map<string, Recipe> {
  if (!cache) cache = new Map(RECIPE_FILES.map((raw) => parseRecipe(raw)).map((r) => [r.id, r]));
  return cache;
}

export function getRecipe(id: string): Recipe | null {
  return recipes().get(id) ?? null;
}

export function listRecipes(): Recipe[] {
  return [...recipes().values()];
}
