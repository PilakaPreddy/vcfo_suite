import { describe, expect, it } from 'vitest';
import {
  postLoginPath,
  roleHomePath,
  roleNotificationsPath,
  roleProfilePath,
  roleSettingsPath,
} from './auth-routes';

describe('roleProfilePath', () => {
  it('sends every role to its own profile page', () => {
    expect(roleProfilePath('admin')).toBe('/app/admin/profile');
    expect(roleProfilePath('manager')).toBe('/app/manager/profile');
    expect(roleProfilePath('intern')).toBe('/app/intern/profile');
    expect(roleProfilePath('super_admin')).toBe('/app/super/profile');
    expect(roleProfilePath('client')).toBe('/app/client/profile');
    expect(roleProfilePath('developer')).toBe('/app/dev/profile');
    expect(roleProfilePath('partner')).toBe('/receivables/account');
  });
});

describe('client partner paths', () => {
  it('keeps a partner on the receivables pages', () => {
    expect(roleHomePath('partner')).toBe('/receivables');
    expect(roleNotificationsPath('partner')).toBe('/receivables');
    expect(roleSettingsPath('partner')).toBe('/receivables/account');
  });
});

describe('postLoginPath', () => {
  it('returns to the receivables manager area', () => {
    expect(postLoginPath('manager', '/receivables/manager')).toBe('/receivables/manager');
    expect(postLoginPath('admin', '/receivables/manager/partners')).toBe('/receivables/manager/partners');
  });

  it('ignores every other next and falls back to the role home', () => {
    expect(postLoginPath('manager', null)).toBe('/app/manager/dashboard');
    expect(postLoginPath('manager', 'https://evil.example/receivables/manager')).toBe('/app/manager/dashboard');
    expect(postLoginPath('manager', '//evil.example/receivables/manager')).toBe('/app/manager/dashboard');
    expect(postLoginPath('manager', '/receivables/managerx')).toBe('/app/manager/dashboard');
    expect(postLoginPath('client', '/app/admin/dashboard')).toBe('/app/client/overview');
  });
});

describe('postLoginPath for a client partner', () => {
  it('honours a partner page as next, with its query', () => {
    expect(postLoginPath('partner', '/receivables')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivables?invoice=0b6f-12ab')).toBe('/receivables?invoice=0b6f-12ab');
    expect(postLoginPath('partner', '/receivables/account')).toBe('/receivables/account');
  });

  it('always lands a partner in /receivables, never in /app or the manager area', () => {
    expect(postLoginPath('partner', null)).toBe('/receivables');
    expect(postLoginPath('partner', '/app/client/overview')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivables/manager')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivables/manager/partners')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivables/login')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivables//evil.example')).toBe('/receivables');
    expect(postLoginPath('partner', 'https://evil.example/receivables')).toBe('/receivables');
    expect(postLoginPath('partner', '/receivablesx')).toBe('/receivables');
  });

  it('does not send staff to the partner pages', () => {
    expect(postLoginPath('manager', '/receivables')).toBe('/app/manager/dashboard');
  });
});
