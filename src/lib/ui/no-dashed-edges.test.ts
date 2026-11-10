import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule (2026-11-09): no dashed or dotted edge anywhere in the app. This walks the
 * source and fails on a Tailwind dashed class, a dashed CSS border or outline, or a literal
 * dash pattern on an SVG stroke. The public landing page's drawn animations are left out.
 */
const ROOTS = ['src', 'app'];
const SKIP = [/node_modules/, /\/css\//, /marketing\/landing/, /\.test\.tsx?$/];
const BAD = [
  /\b(?:border|outline)-(?:dashed|dotted)\b/,
  /\b(?:border|outline)(?:-(?:top|right|bottom|left))?\s*:[^;{}]*\b(?:dashed|dotted)\b/,
  /\bstroke-dasharray\s*:\s*\d+(?:\.\d+)?\s+\d+/,
  /strokeDasharray="\d+(?:\.\d+)?\s+\d+"/,
];

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.some((re) => re.test(p))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe('no dashed or dotted edges', () => {
  it('finds none in the source', () => {
    const hits: string[] = [];
    for (const file of ROOTS.flatMap((r) => walk(r, []))) {
      const text = readFileSync(file, 'utf8');
      for (const re of BAD) {
        const m = re.exec(text);
        if (m) hits.push(`${file}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
