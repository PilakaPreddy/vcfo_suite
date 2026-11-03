import { describe, expect, it } from 'vitest';
import { postLoginPath, roleProfilePath } from './auth-routes';

describe('roleProfilePath', () => {
  it('sends every role to its own profile page', () => {
    expect(roleProfilePath('admin')).toBe('/app/admin/profile');
    expect(roleProfilePath('manager')).toBe('/app/manager/profile');
    expect(roleProfilePath('intern')).toBe('/app/intern/profile');
    expect(roleProfilePath('super_admin')).toBe('/app/super/profile');
    expect(roleProfilePath('client')).toBe('/app/client/profile');
    expect(roleProfilePath('developer')).toBe('/app/dev/profile');
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
