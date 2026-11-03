import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These pages shipped broken once, and a unit test is why it got through.
 *
 * The screens hand Lucide icons to client components (`LrCardHead`'s `icon`, `RegisterList`'s
 * `icon`). A function cannot cross the server-to-client boundary, so while the page was a
 * server component every request to it threw and the shell showed its error boundary.
 * Rendering it with Testing Library did not catch that: jsdom renders everything as plain
 * React, with no boundary to cross. Only the real pipeline — `npm run e2e:smoke`, or a request
 * to a running server — does.
 *
 * So this guards the cheap half: the directive itself, on every screen that passes an icon
 * across. The expensive half is the smoke spec, which already lists the routes.
 */
const SCREENS = ['LabourRegistersPage.tsx', 'ClientRegistersPage.tsx', 'BatchPage.tsx'] as const;

describe.each(SCREENS)('%s', (file) => {
  const source = readFileSync(join(__dirname, file), 'utf8');

  it('is a client component, because it passes icon components to client components', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('still passes icons, which is what makes the directive load-bearing', () => {
    /* If this ever stops being true the directive may be droppable — but check the real
       pipeline before dropping it, not a jsdom render. */
    expect(source).toMatch(/\bicon(?:=\{|:\s)/);
    expect(source).toMatch(/from 'lucide-react'/);
  });

  it('imports nothing that only runs on the server', () => {
    expect(source).not.toMatch(/from '@\/db\//);
    expect(source).not.toMatch(/server-only/);
    expect(source).not.toMatch(/node:/);
  });
});

describe('the feature keeps its tokens to itself', () => {
  /*
   * The reference design the screens were built to is a different system from Spectrum, and
   * `theme.ts` says why it is scoped to this folder rather than put in `globals.css`. That
   * scoping is only true while nothing outside the feature imports it, so check.
   */
  it('nothing outside labour-registers imports the feature theme', () => {
    const root = join(__dirname, '..', '..', '..');
    const hits = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', "labour-registers/theme", 'src', 'app'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.includes('labour-registers'));
    expect(hits).toEqual([]);
  });
});
