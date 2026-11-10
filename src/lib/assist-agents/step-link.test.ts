import { describe, expect, it } from 'vitest';
import { stepSlugForItemId } from '@/lib/slug';
import { assistStepPath } from './step-link';

describe('Fix in Suite step link', () => {
  const project = { slug: 'acme-labs', id: 'eng-1' };
  const slug = stepSlugForItemId('pre-4');

  it('opens the step in the shell each staff role can open', () => {
    expect(assistStepPath('intern', project, 'pre-4')).toBe(`/app/intern/engagements/acme-labs/step/${slug}`);
    expect(assistStepPath('manager', project, 'pre-4')).toBe(`/app/manager/projects/acme-labs/step/${slug}`);
    expect(assistStepPath('admin', project, 'pre-4')).toBe(`/app/admin/projects/acme-labs/step/${slug}`);
    // The super admin has no project routes of their own; the admin shell admits them.
    expect(assistStepPath('super_admin', project, 'pre-4')).toBe(`/app/admin/projects/acme-labs/step/${slug}`);
  });

  it('falls back to the engagement page for an unknown or missing step, and to the id without a slug', () => {
    expect(assistStepPath('intern', project, 'nope')).toBe('/app/intern/engagements/acme-labs');
    expect(assistStepPath('manager', { id: 'eng-1' }, null)).toBe('/app/manager/projects/eng-1');
  });

  it('sends any other role home', () => {
    expect(assistStepPath('client', project, 'pre-4')).toBe('/app/client/overview');
  });
});
