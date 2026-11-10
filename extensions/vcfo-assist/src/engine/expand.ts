/**
 * Repeating groups. A recipe field with `each: 'directors'` is a template (`directors[{i}].din`);
 * once the profile is loaded the engine turns it into one field per entry of that profile array,
 * replacing `{i}` (0-based) and `{n}` (1-based) in the key, SOM path, CSS selector and label. The
 * profile alone decides how many blocks are filled; an empty or absent array fills none. The
 * expanded recipe is what the run saves, so a restored run fills exactly what it planned.
 */
import { getPath } from './values';
import { nameFromCss, nameFromSom } from '../recipes/normalize';
import type { Recipe, RecipeField } from '../shared/types';

/** No portal form repeats a block this often; a larger array is cut, never looped over blindly. */
export const MAX_REPEAT = 20;

function instance(field: RecipeField, i: number): RecipeField {
  const fill = (t: string | undefined) => t?.replace(/\{i\}/g, String(i)).replace(/\{n\}/g, String(i + 1));
  const { each: _each, ...rest } = field;
  const som = fill(field.som);
  const css = fill(field.css);
  return { ...rest, key: fill(field.key)!, label: fill(field.label)!, som, css, name: nameFromCss(css) ?? nameFromSom(som) };
}

/** How many entries the profile holds for one `each` array. */
export function repeatCount(profile: unknown, each: string): number {
  const list = getPath(profile, each);
  return Array.isArray(list) ? Math.min(list.length, MAX_REPEAT) : 0;
}

export function expandFields(fields: RecipeField[], profile: unknown): RecipeField[] {
  // Templates of one group stay together, instance by instance: director 1's fields, then director 2's.
  const out: RecipeField[] = [];
  const done = new Set<string>();
  for (const field of fields) {
    if (!field.each) {
      out.push(field);
      continue;
    }
    if (done.has(field.each)) continue;
    done.add(field.each);
    const group = fields.filter((f) => f.each === field.each);
    for (let i = 0; i < repeatCount(profile, field.each); i += 1) for (const f of group) out.push(instance(f, i));
  }
  return out;
}

export function expandRecipe(recipe: Recipe, profile: unknown): Recipe {
  return { ...recipe, pages: recipe.pages.map((p) => ({ ...p, fields: expandFields(p.fields, profile) })) };
}

/** True when the recipe still has templates (the profile has not been applied yet). */
export function hasTemplates(recipe: Recipe): boolean {
  return recipe.pages.some((p) => p.fields.some((f) => f.each));
}
