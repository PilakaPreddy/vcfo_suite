import { describe, expect, it } from 'vitest';
import type { Destination } from '@/data/ask/schema';
import { checkDestination, sanitizeLinks } from '@/lib/ask/destinations';
import { askProjectPath, LEAD_BASE, resolveHref, stripAskParams } from '@/lib/ask/resolve-href';
import { nextStepAnswer, staffQueryAnswer } from '@/lib/ask/suggestions';
import { SNAPSHOTS } from '../../../../tests/ask/evals/golden';

const STAFF_DESTS: Destination[] = [
  { to: 'project', engagementId: 'acme' },
  { to: 'projectStep', engagementId: 'acme', stepId: 'pre-14' },
  { to: 'approvals' },
  { to: 'compliance', filter: 'overdue' },
  { to: 'composeReminder', engagementId: 'acme' },
];

describe('resolveHref', () => {
  it('never sends an admin or super admin to /app/manager', () => {
    for (const base of ['/app/admin', 'admin', '/app/super', 'super_admin'] as const) {
      for (const dest of STAFF_DESTS) {
        const href = resolveHref(dest, base);
        expect(href, `${base} ${dest.to}`).not.toContain('/app/manager');
        expect(href.startsWith('/app/admin/')).toBe(true);
      }
    }
  });

  it('keeps a manager in their own shell', () => {
    expect(resolveHref({ to: 'approvals' }, '/app/manager')).toMatch(/^\/app\/manager\/approvals/);
  });

  it('adds arrival params that stripAskParams removes', () => {
    const href = resolveHref({ to: 'incorporation', focusStepId: 'pre-13' }, '/app/admin');
    expect(href).toBe('/app/client/incorporation?from=ask&focus=pre-13');
    expect(stripAskParams('?from=ask&focus=pre-13&tab=x')).toBe('?tab=x');
    expect(stripAskParams('?from=ask&focus=pre-13')).toBe('');
  });
});

describe('checkDestination', () => {
  const client = { shell: 'client' as const, lockedStepIds: new Set(['pre-13']) };
  const staff = { shell: 'admin' as const, engagementKeys: new Set(['acme']) };

  it('lands a locked step on the Incorporation flowchart, not its form', () => {
    expect(checkDestination({ to: 'step', stepId: 'pre-13' }, client)).toEqual({ to: 'incorporation', focusStepId: 'pre-13' });
    expect(checkDestination({ to: 'step', stepId: 'pre-1' }, client)).toEqual({ to: 'step', stepId: 'pre-1' });
    const [link] = sanitizeLinks([{ dest: { to: 'step', stepId: 'pre-13' }, label: 'Upload now', primary: true }], client);
    expect(link).toEqual({ dest: { to: 'incorporation', focusStepId: 'pre-13' }, label: 'Open Incorporation', primary: true });
  });

  it('drops legacy steps and staff places in the client shell', () => {
    expect(checkDestination({ to: 'step', stepId: 'reg-2' }, client)).toBeNull();
    expect(checkDestination({ to: 'approvals' }, client)).toBeNull();
    expect(checkDestination({ to: 'project', engagementId: 'acme' }, client)).toBeNull();
    expect(checkDestination({ to: 'learn', slug: 'no-such-topic' }, client)).toBeNull();
  });

  it('drops cross-engagement links and client places for staff', () => {
    expect(checkDestination({ to: 'project', engagementId: 'someone-else' }, staff)).toBeNull();
    expect(checkDestination({ to: 'projectStep', engagementId: 'someone-else', stepId: 'pre-1' }, staff)).toBeNull();
    expect(checkDestination({ to: 'composeReminder', engagementId: 'someone-else' }, staff)).toBeNull();
    expect(checkDestination({ to: 'incorporation' }, staff)).toBeNull();
    expect(checkDestination({ to: 'project', engagementId: 'acme' }, staff)).toEqual({ to: 'project', engagementId: 'acme' });
  });

  it('caps links at two with one primary, primary first', () => {
    const links = sanitizeLinks(
      [
        { dest: { to: 'approvals' }, label: 'A' },
        { dest: { to: 'compliance' }, label: 'B', primary: true },
        { dest: { to: 'project', engagementId: 'acme' }, label: 'C', primary: true },
        { dest: { to: 'project', engagementId: 'acme' }, label: 'D' },
      ],
      staff,
    );
    expect(links.map((l) => l.label)).toEqual(['B', 'A']);
    expect(links.filter((l) => l.primary)).toHaveLength(1);
  });
});

describe('deterministic answers carry links', () => {
  it('"What is my next step?" links to the step and to Incorporation', () => {
    const answer = nextStepAnswer(SNAPSHOTS.foreignCompany);
    expect(answer.links?.map((l) => l.dest.to)).toEqual(['step', 'incorporation']);
    expect(answer.links?.[0]?.primary).toBe(true);
  });

  it('"What is my next step?" labels an upload step from its client form fields', () => {
    // pre-14 (Registered Office Address) has a client file field.
    const [link] = nextStepAnswer(SNAPSHOTS.foreignCompany).links ?? [];
    expect(link?.label).toBe('Upload documents now');
    expect(link?.dest).toEqual({ to: 'step', stepId: 'pre-14', section: 'upload' });
  });

  it('"What is my next step?" falls back to "Open this step" when the step has no file field', () => {
    const snapshot = {
      ...SNAPSHOTS.foreignCompany,
      currentStep: { id: 'pre-13', title: 'Capital Structure', owner: 'client' as const, status: 'waiting on you' },
    };
    const [link] = nextStepAnswer(snapshot).links ?? [];
    expect(link?.label).toBe('Open this step');
    expect(link?.dest).toEqual({ to: 'step', stepId: 'pre-13', section: 'form' });
  });

  it('staff query answers link into Projects / Approvals / Compliance', () => {
    const data = { engagements: [], filings: [], now: new Date('2026-10-01') };
    expect(staffQueryAnswer('pendingApprovals', data).links?.[0]?.dest).toEqual({ to: 'approvals' });
    expect(staffQueryAnswer('overdueAndDueSoon', data).links?.[0]?.dest).toEqual({ to: 'compliance', filter: 'overdue' });
  });
});

describe('links per shell', () => {
  it('sends a Project Lead to the lead pages, never a manager page', () => {
    expect(resolveHref({ to: 'project', engagementId: 'acme' }, LEAD_BASE)).toMatch(/^\/app\/intern\/engagements\/acme\?/);
    expect(resolveHref({ to: 'projectStep', engagementId: 'acme', stepId: 'pre-2' }, LEAD_BASE)).toMatch(/^\/app\/intern\/engagements\/acme\//);
    expect(resolveHref({ to: 'approvals' }, LEAD_BASE)).toMatch(/^\/app\/intern\/clients\?/);
    expect(resolveHref({ to: 'compliance' }, LEAD_BASE)).toMatch(/^\/app\/intern\/compliances\/filings\?/);
    expect(resolveHref({ to: 'composeReminder', engagementId: 'acme' }, LEAD_BASE)).toMatch(/^\/app\/intern\/mail\?/);
    expect(askProjectPath('acme', LEAD_BASE)).toBe('/app/intern/engagements/acme');
  });

  it.each([
    ['projects', '/app/admin', '/app/admin/projects'],
    ['projects', '/app/manager', '/app/manager/projects'],
    ['projects', '/app/super', '/app/admin/projects'],
    ['projects', LEAD_BASE, '/app/intern/clients'],
    ['approvals', '/app/manager', '/app/manager/approvals'],
    ['approvals', LEAD_BASE, '/app/intern/clients'],
    ['filings', '/app/admin', '/app/admin/compliances/filings'],
    ['filings', LEAD_BASE, '/app/intern/compliances/filings'],
    ['filings', '/app/client', '/app/client/compliances/filings'],
    ['requests', LEAD_BASE, '/app/intern/requests'],
    ['requests', '/app/client', '/app/client/documents'],
    ['tasks', LEAD_BASE, '/app/intern/tasks'],
    ['tasks', '/app/manager', '/app/manager/work'],
    ['tasks', '/app/admin', '/app/admin/projects'],
    ['documents', '/app/client', '/app/client/documents'],
    ['documents', '/app/manager', '/app/manager/vault'],
    ['registrations', '/app/client', '/app/client/registrations'],
    ['labour', LEAD_BASE, '/app/intern/labour-registers'],
    ['people', '/app/admin', '/app/admin/people'],
    ['updates', '/app/client', '/app/client/announcements'],
    ['receivables', '/app/manager', '/receivables/manager'],
  ] as const)('%s from %s opens %s', (list, base, path) => {
    expect(resolveHref({ to: 'list', list }, base).split('?')[0]).toBe(path);
  });

  it('carries the filter onto the list', () => {
    const href = resolveHref({ to: 'list', list: 'filings', status: 'overdue', company: 'acme' }, '/app/admin');
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('status')).toBe('overdue');
    expect(params.get('company')).toBe('acme');
    expect(params.get('cadence')).toBe('annual');
    expect(resolveHref({ to: 'list', list: 'projects', view: 'waiting' }, LEAD_BASE)).toContain('view=waiting');
  });

  it('keeps staff lists out of a client answer but leaves the client lists', () => {
    expect(checkDestination({ to: 'list', list: 'filings' }, { shell: 'client' })).toEqual({ to: 'list', list: 'filings' });
    expect(checkDestination({ to: 'list', list: 'approvals' }, { shell: 'client' })).toBeNull();
    expect(checkDestination({ to: 'list', list: 'people' }, { shell: 'client' })).toBeNull();
    expect(checkDestination({ to: 'list', list: 'people' }, { shell: 'admin' })).toEqual({ to: 'list', list: 'people' });
  });
});
