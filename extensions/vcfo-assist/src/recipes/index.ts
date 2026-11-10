/**
 * Recipes shipped inside the extension. `bundled.json` is GENERATED from Suite's registry
 * (`src/lib/assist-agents/recipes/*.json`, the single source) by
 * `node --conditions=react-server --import tsx scripts/assist-recipes-bundle.ts` in the Suite
 * repository, and signed with Suite's dev key, so the bundled copies run only on mock hosts. Suite's
 * own answer is preferred when it verifies; this is the fallback. `recipes.test.ts` fails when the
 * bundle and Suite's recipes drift apart.
 */
import bundle from './bundled.json';
import type { SignedRecipe } from '../shared/types';

export const BUNDLED_RECIPES: Record<string, SignedRecipe> = bundle.recipes;
