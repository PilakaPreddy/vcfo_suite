import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOST_PERMISSIONS, PERMISSIONS } from '../wxt.config';

// SAFETY.md "Supporting controls": a new permission, a new host or a solver package fails the build.
describe('manifest and dependencies', () => {
  it('asks only for sidePanel, scripting and storage', () => {
    expect([...PERMISSIONS].sort()).toEqual(['scripting', 'sidePanel', 'storage']);
  });

  it('asks only for the Suite, mock and MCA hosts', () => {
    expect([...HOST_PERMISSIONS].sort()).toEqual(['http://127.0.0.1/*', 'http://localhost/*', 'https://*.mca.gov.in/*', 'https://app.sbctrack.in/*']);
  });

  it('has no captcha solver, OTP reader or automation-cloud package', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
    expect(deps).not.toMatch(/captcha|2captcha|anticaptcha|anti-captcha|capsolver|skyvern|tesseract|sms|otp|browserbase|puppeteer-extra/i);
  });
});
