import { describe, expect, it } from 'vitest';
import { isReceivablesPartnerPath, isReceivablesSharePath, proxyRedirect } from './proxy-routes';

describe('proxyRedirect, signed out', () => {
  it('sends /app and the receivables manager area to the staff login', () => {
    expect(proxyRedirect('/app/admin/dashboard', '', null)).toBe('/login?next=%2Fapp%2Fadmin%2Fdashboard');
    expect(proxyRedirect('/receivables/manager', '', undefined)).toBe('/login?next=%2Freceivables%2Fmanager');
    expect(proxyRedirect('/receivables/manager/partners', '', null)).toBe(
      '/login?next=%2Freceivables%2Fmanager%2Fpartners',
    );
  });

  it('sends the partner pages to the partner login, keeping the query', () => {
    expect(proxyRedirect('/receivables', '', null)).toBe('/receivables/login?next=%2Freceivables');
    expect(proxyRedirect('/receivables', '?invoice=abc', null)).toBe(
      '/receivables/login?next=%2Freceivables%3Finvoice%3Dabc',
    );
    expect(proxyRedirect('/receivables/account', '', null)).toBe('/receivables/login?next=%2Freceivables%2Faccount');
  });

  it('leaves the public pages alone', () => {
    expect(proxyRedirect('/', '', null)).toBeNull();
    expect(proxyRedirect('/login', '', null)).toBeNull();
    expect(proxyRedirect('/receivables/login', '?next=%2Freceivables', null)).toBeNull();
    expect(proxyRedirect('/receivables/set-password', '?token=x', null)).toBeNull();
    expect(proxyRedirect('/receivables/set-password/abc', '', null)).toBeNull();
  });
});

describe('proxyRedirect, client partner', () => {
  it('keeps a partner out of /app and the manager area', () => {
    expect(proxyRedirect('/app/client/overview', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/app/admin/dashboard', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/receivables/manager', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/receivables/manager/x', '', 'partner')).toBe('/receivables');
  });

  it('sends a signed-in partner from the login pages to their page', () => {
    expect(proxyRedirect('/', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/login', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/receivables/login', '', 'partner')).toBe('/receivables');
    expect(proxyRedirect('/receivables/login', '?next=%2Freceivables%3Finvoice%3Dabc', 'partner')).toBe(
      '/receivables?invoice=abc',
    );
    expect(proxyRedirect('/receivables/login', '?next=%2Fapp%2Fadmin', 'partner')).toBe('/receivables');
  });

  it('lets a partner through to the partner pages', () => {
    expect(proxyRedirect('/receivables', '', 'partner')).toBeNull();
    expect(proxyRedirect('/receivables/account', '', 'partner')).toBeNull();
    expect(proxyRedirect('/receivables/set-password', '', 'partner')).toBeNull();
  });
});

describe('proxyRedirect, staff and clients', () => {
  it('sends receivables editors from the partner pages to the manager area', () => {
    expect(proxyRedirect('/receivables', '', 'manager')).toBe('/receivables/manager');
    expect(proxyRedirect('/receivables/login', '', 'admin')).toBe('/receivables/manager');
    expect(proxyRedirect('/receivables/account', '', 'super_admin')).toBe('/receivables/manager');
  });

  it('sends other roles from the partner pages to their home', () => {
    expect(proxyRedirect('/receivables', '', 'intern')).toBe('/app/intern/today');
    expect(proxyRedirect('/receivables', '', 'client')).toBe('/app/client/overview');
    expect(proxyRedirect('/receivables', '', 'developer')).toBe('/app/dev/overview');
  });

  it('lets staff into the manager area; the page checks the role again', () => {
    expect(proxyRedirect('/receivables/manager', '', 'manager')).toBeNull();
    expect(proxyRedirect('/receivables/manager', '', 'intern')).toBeNull();
  });

  it('keeps the role-home and cross-role rules', () => {
    expect(proxyRedirect('/', '', 'admin')).toBe('/app/admin/dashboard');
    expect(proxyRedirect('/login', '', 'client')).toBe('/app/client/overview');
    expect(proxyRedirect('/login', '', 'unknown_role')).toBe('/login');
    expect(proxyRedirect('/app/admin/dashboard', '', 'manager')).toBe('/app/manager/dashboard');
    expect(proxyRedirect('/app/manager/dashboard', '', 'manager')).toBeNull();
    expect(proxyRedirect('/app/dev/overview', '', 'super_admin')).toBeNull();
    expect(proxyRedirect('/app/client/overview', '', 'developer')).toBe('/app/dev/overview');
    expect(proxyRedirect('/app/unknown/page', '', 'intern')).toBeNull();
  });
});

describe('isReceivablesPartnerPath', () => {
  it('matches the partner pages only', () => {
    expect(isReceivablesPartnerPath('/receivables')).toBe(true);
    expect(isReceivablesPartnerPath('/receivables/account')).toBe(true);
    expect(isReceivablesPartnerPath('/receivables/manager')).toBe(false);
    expect(isReceivablesPartnerPath('/receivables/login')).toBe(false);
    expect(isReceivablesPartnerPath('/receivablesx')).toBe(false);
  });
});

describe('proxyRedirect, shared views', () => {
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
  const path = `/receivables/s/${token}`;

  it('lets everyone through to a shared view; the page applies the visibility rule', () => {
    for (const role of [null, undefined, 'partner', 'manager', 'admin', 'super_admin', 'intern', 'client', 'developer']) {
      expect(proxyRedirect(path, '', role)).toBeNull();
    }
  });

  it('sends a signed-in person on the partner login straight back to the shared view', () => {
    const search = `?next=${encodeURIComponent(path)}`;
    expect(proxyRedirect('/receivables/login', search, 'partner')).toBe(path);
    expect(proxyRedirect('/receivables/login', search, 'manager')).toBe(path);
    expect(proxyRedirect('/receivables/login', search, 'admin')).toBe(path);
    expect(proxyRedirect('/receivables/login', search, null)).toBeNull();
  });

  it('does not treat /receivables/s itself as a shared view', () => {
    expect(isReceivablesSharePath('/receivables/s/')).toBe(false);
    expect(isReceivablesSharePath('/receivables/s')).toBe(false);
    expect(isReceivablesSharePath(path)).toBe(true);
    expect(isReceivablesPartnerPath(path)).toBe(false);
  });
});
