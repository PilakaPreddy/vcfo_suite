/**
 * Recipes shipped inside the extension, in Suite's recipe format, signed with the MOCK key so they
 * run only on the local mock portal. Suite's registry is preferred when it answers; this is the
 * fallback. `spice-a.json` is Suite's spice-a recipe plus the Check form, Download PDF and attach
 * actions and the DSC gate the mock flow needs. Re-sign after any edit:
 * `node scripts/sign-recipe.mjs src/recipes/spice-a.json`.
 */
import spiceA from './spice-a.json';
import type { SignedRecipe } from '../shared/types';

export const BUNDLED_RECIPES: Record<string, SignedRecipe> = {
  'spice-a': {
    recipe: spiceA,
    sig: '8pjin34rcvE8LCzEZLQvqs4/uMtK9QOUqd9i06bS7KT9vxGX6uAEamrmSbykeuFI8M1oSvslB9DH4LyN8Oe6pg==',
  },
};
