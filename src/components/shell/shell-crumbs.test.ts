import { describe, expect, it } from 'vitest';
import {
  pageTitleRepeatsTrail,
  resolveShellCrumbCurrent,
  shellBreadcrumb,
  shellCrumbParent,
} from './shell-crumbs';

function labels(pathname: string) {
  return shellBreadcrumb(pathname).segments.map((seg) => seg.label);
}

function hrefs(pathname: string) {
  return shellBreadcrumb(pathname).segments.map((seg) => seg.href);
}

describe('shellBreadcrumb', () => {
  it('names the role home after its first sidebar row', () => {
    expect(shellBreadcrumb('/app/intern/today')).toEqual({ icon: 'home', segments: [{ label: 'Today', href: null }] });
    expect(labels('/app/manager/dashboard')).toEqual(['Today']);
    expect(labels('/app/admin/dashboard')).toEqual(['Today']);
    expect(labels('/app/client/overview')).toEqual(['Home']);
    expect(labels('/app/super/dashboard')).toEqual(['Overview']);
  });

  it('never starts with a Home crumb', () => {
    expect(labels('/app/intern/clients')).toEqual(['Clients']);
    expect(labels('/app/intern/tasks')).toEqual(['Work']);
    expect(labels('/app/intern/mail')).toEqual(['Email']);
    expect(labels('/app/admin/people')).toEqual(['People']);
  });

  it('nests announcements and notifications under Updates', () => {
    expect(labels('/app/intern/announcements')).toEqual(['Updates', 'Announcements']);
    expect(hrefs('/app/intern/announcements')).toEqual(['/app/intern/announcements', null]);
    expect(shellBreadcrumb('/app/manager/notifications').icon).toBe('bell');
  });

  it('nests vault and knowledge bank under Docs', () => {
    expect(labels('/app/intern/vault')).toEqual(['Docs', 'Vault']);
    expect(labels('/app/manager/knowledge-bank')).toEqual(['Docs', 'Knowledge bank']);
    expect(shellCrumbParent('knowledge-bank')).toBe('Docs');
    expect(shellCrumbParent('compliances')).toBe('Compliances');
  });

  it('keeps records and steps to the sidebar row', () => {
    expect(labels('/app/intern/engagements/pexpo-inc')).toEqual(['Clients']);
    expect(labels('/app/intern/engagements/pexpo-inc/step/name-application')).toEqual(['Clients']);
    expect(labels('/app/manager/projects/pexpo-inc/step/kyc-review-and-dsc-creation')).toEqual(['Projects']);
    expect(labels('/app/client/incorporation/step/name-application')).toEqual(['Incorporation']);
  });

  it('names the pages that have no sidebar row', () => {
    expect(labels('/app/intern/engagements/pexpo-inc/documents')).toEqual(['Clients', 'Documents']);
    expect(labels('/app/manager/projects/pexpo-inc/board-resolution')).toEqual(['Projects', 'Board resolution']);
    expect(labels('/app/client/board-resolution')).toEqual(['Incorporation', 'Board resolution']);
    expect(labels('/app/admin/projects/new')).toEqual(['Projects', 'New project']);
  });

  it('never shows a raw id', () => {
    expect(labels('/app/manager/registrations/0c3489fd-fb41-4b22-9e1a-111111111111~reg-4')).toEqual(['Registrations']);
  });

  it('nests Calendar and Filings under Compliances for every shell', () => {
    expect(labels('/app/intern/compliances/filings')).toEqual(['Compliances', 'Filings']);
    expect(hrefs('/app/intern/compliances/filings')).toEqual(['/app/intern/compliances/calendar', null]);
    expect(labels('/app/admin/compliances/calendar')).toEqual(['Compliances', 'Calendar']);
    expect(shellBreadcrumb('/app/client/compliances/filings').icon).toBe('calendar');
  });
});

describe('pageTitleRepeatsTrail', () => {
  it('treats route names that match the last crumb as redundant', () => {
    expect(pageTitleRepeatsTrail('Calendar', '/app/intern/compliances/calendar')).toBe(true);
    expect(pageTitleRepeatsTrail('filings', '/app/manager/compliances/filings')).toBe(true);
    expect(pageTitleRepeatsTrail('Work', '/app/intern/tasks')).toBe(true);
    expect(pageTitleRepeatsTrail('Email', '/app/intern/mail')).toBe(true);
    expect(pageTitleRepeatsTrail('New project', '/app/admin/projects/new')).toBe(true);
  });

  it('keeps titles that add information beyond the trail leaf', () => {
    expect(pageTitleRepeatsTrail('Statutory calendar', '/app/intern/compliances/calendar')).toBe(false);
    expect(pageTitleRepeatsTrail("Bird's-eye overview", '/app/super/dashboard')).toBe(false);
  });
});

describe('resolveShellCrumbCurrent', () => {
  it('reads the leaf of the trail', () => {
    expect(resolveShellCrumbCurrent(shellBreadcrumb('/app/intern/engagements/acme-holdings/documents'), [])).toBe('Documents');
    expect(resolveShellCrumbCurrent(shellBreadcrumb('/app/intern/clients'), [])).toBe('Clients');
  });
});
