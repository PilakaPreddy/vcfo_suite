import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * This page shipped broken once, and a unit test is why it got through.
 *
 * `DashHero` and `DashSection` are client components, and this page hands them Lucide icons
 * (`stats[].icon`, `headIcon.icon`). A function cannot cross the server-to-client boundary, so
 * while the page was a server component every request to it threw and the shell showed its error
 * boundary. Rendering it with Testing Library did not catch that: jsdom renders everything as
 * plain React, with no boundary to cross. Only the real pipeline — `npm run e2e:smoke`, or a
 * request to a running server — does.
 *
 * So this guards the cheap half: the directive itself. The expensive half is the smoke spec,
 * which already lists the route.
 */
describe('LabourRegistersPage', () => {
  const source = readFileSync(join(__dirname, 'LabourRegistersPage.tsx'), 'utf8');

  it("is a client component, because it passes icon components to client components", () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('still passes icons, which is what makes the directive load-bearing', () => {
    /* If this ever stops being true the directive may be droppable — but check the real
       pipeline before dropping it, not a jsdom render. */
    expect(source).toMatch(/headIcon=\{\{\s*icon:/);
    expect(source).toMatch(/icon:\s*ScrollText/);
  });

  it('imports nothing that only runs on the server', () => {
    expect(source).not.toMatch(/from '@\/db\//);
    expect(source).not.toMatch(/server-only/);
    expect(source).not.toMatch(/node:/);
  });
});
