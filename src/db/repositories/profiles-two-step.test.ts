import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';

/**
 * Two-step sign-in and the sign-in check in `profiles.ts` (G-25): owner-only
 * setup, confirm and turn-off; an admin reset that a manager cannot use and a
 * firm admin cannot point at the super admin; a sign-in check that never says
 * which part was wrong.
 */

type Call = { op: string; where?: SQL; set?: Record<string, unknown> };
const calls: Call[] = [];
let results: unknown[][] = [];

function chain(call: Call): unknown {
  const c: Record<string, unknown> = {
    from: () => c,
    orderBy: () => c,
    limit: () => c,
    returning: () => c,
    set: (v: Record<string, unknown>) => {
      call.set = v;
      return c;
    },
    values: () => c,
    where: (w: SQL) => {
      call.where = w;
      return c;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(res, rej),
  };
  return c;
}
function op(name: string) {
  return () => {
    const call: Call = { op: name };
    calls.push(call);
    return chain(call);
  };
}

vi.mock('@/db/client', () => ({
  db: { select: op('select'), insert: op('insert'), update: op('update') },
}));
const recordAuditEvent = vi.fn();
vi.mock('@/db/repositories/audit-events', () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a),
}));
vi.mock('@/db/repositories/rate-limits', () => ({
  systemTakeRateLimit: vi.fn(async () => true),
  systemPeekRateLimit: vi.fn(async () => 0),
  systemClearRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/db/repositories/notification-prefs', () => ({ systemGetWhatsAppGatePrefs: vi.fn() }));

const repo = await import('@/db/repositories/profiles');
const { encryptTotpSecret, decryptTotpSecret } = await import('@/lib/totp/secret-box');
const { base32Decode, generateTotpSecret, totpAt } = await import('@/lib/totp/totp');
const { resetTotpGuard } = await import('@/lib/totp/guard');

const dialect = new PgDialect();
const ME = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

function ctx(role: AuthContext['role'] = 'manager', userId = ME): AuthContext {
  return { userId, email: 'me@sbc.in', name: 'Me', role };
}
function params(call: Call | undefined) {
  return call?.where ? dialect.sqlToQuery(call.where).params : [];
}
function codeFor(secret: string) {
  return totpAt(base32Decode(secret), Date.now());
}

beforeEach(() => {
  calls.length = 0;
  results = [];
  recordAuditEvent.mockReset();
  resetTotpGuard();
});

describe('owner-only two-step setup', () => {
  it('reads the caller’s own row', async () => {
    results = [[{ email: 'me@sbc.in', totpSecretEnc: null, totpEnabledAt: null }]];
    expect(await repo.getOwnTwoStep(ctx())).toEqual({ enabled: false, enabledAt: null });
    expect(params(calls[0])).toEqual([ME]);
  });

  it('starts setup with a sealed secret on the caller’s row only', async () => {
    results = [[{ email: 'me@sbc.in', totpSecretEnc: null, totpEnabledAt: null }], []];
    const out = await repo.startOwnTwoStepSetup(ctx());
    if (out === 'already_on') throw new Error('expected a secret');
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.uri).toContain(`secret=${out.secret}`);
    const update = calls[1];
    expect(update.op).toBe('update');
    expect(params(update)).toEqual([ME]);
    expect(update.set?.totpEnabledAt).toBeNull();
    expect(decryptTotpSecret(ME, update.set?.totpSecretEnc as string)).toBe(out.secret);
  });

  it('will not replace a confirmed secret', async () => {
    results = [[{ email: 'me@sbc.in', totpSecretEnc: 't1:x', totpEnabledAt: new Date() }]];
    expect(await repo.startOwnTwoStepSetup(ctx())).toBe('already_on');
    expect(calls).toHaveLength(1);
  });

  it('confirms with a right code and refuses a wrong one', async () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(ME, secret);
    results = [[{ email: 'me@sbc.in', totpSecretEnc: enc, totpEnabledAt: null }]];
    const bad = await repo.confirmOwnTwoStep(ctx(), codeFor(secret) === '000000' ? '111111' : '000000');
    expect(bad).toEqual({ ok: false, error: 'invalid_code' });

    results = [[{ email: 'me@sbc.in', totpSecretEnc: enc, totpEnabledAt: null }], []];
    const good = await repo.confirmOwnTwoStep(ctx(), codeFor(secret));
    expect(good.ok).toBe(true);
    expect(params(calls.at(-1))).toEqual([ME]);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'account.two_step_on' }));
  });

  it('cannot confirm with a secret sealed for someone else', async () => {
    const secret = generateTotpSecret();
    results = [[{ email: 'me@sbc.in', totpSecretEnc: encryptTotpSecret(TARGET, secret), totpEnabledAt: null }]];
    expect(await repo.confirmOwnTwoStep(ctx(), codeFor(secret))).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('turns off only with a current code', async () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(ME, secret);
    results = [[{ email: 'me@sbc.in', totpSecretEnc: null, totpEnabledAt: null }]];
    expect(await repo.disableOwnTwoStep(ctx(), '123456')).toEqual({ ok: false, error: 'not_on' });

    results = [[{ email: 'me@sbc.in', totpSecretEnc: enc, totpEnabledAt: new Date() }], []];
    expect(await repo.disableOwnTwoStep(ctx(), codeFor(secret))).toEqual({ ok: true });
    expect(calls.at(-1)?.set).toEqual({ totpSecretEnc: null, totpEnabledAt: null });
    expect(params(calls.at(-1))).toEqual([ME]);
  });
});

describe('resetTwoStepFor', () => {
  it('gives a manager, a lead and a client nothing', async () => {
    for (const role of ['manager', 'intern', 'client'] as const) {
      expect(await repo.resetTwoStepFor(ctx(role), TARGET)).toBe('forbidden');
    }
    expect(calls).toHaveLength(0);
  });

  it('lets a firm admin reset a lead but not the super admin or themselves', async () => {
    results = [[{ id: TARGET, role: 'intern', email: 'lead@sbc.in', name: 'Lead' }], []];
    expect(await repo.resetTwoStepFor(ctx('admin'), TARGET)).toBe('ok');
    expect(calls.at(-1)?.set).toEqual({ totpSecretEnc: null, totpEnabledAt: null });
    expect(params(calls.at(-1))).toEqual([TARGET]);

    results = [[{ id: TARGET, role: 'super_admin', email: 'sa@sbc.in', name: 'SA' }]];
    expect(await repo.resetTwoStepFor(ctx('admin'), TARGET)).toBe('forbidden');
    expect(await repo.resetTwoStepFor(ctx('admin'), ME)).toBe('self');

    results = [[{ id: TARGET, role: 'super_admin', email: 'sa@sbc.in', name: 'SA' }], []];
    expect(await repo.resetTwoStepFor(ctx('super_admin'), TARGET)).toBe('ok');
  });
});

describe('systemCheckSignInPassword', () => {
  const hash = bcrypt.hashSync('right-password', 4);
  const row = {
    id: ME,
    email: 'me@sbc.in',
    name: 'Me',
    role: 'manager',
    internId: null,
    clientId: null,
    status: 'active',
    passwordHash: hash,
    avatarObjectKey: null,
    updatedAt: new Date(),
    totpSecretEnc: 't1:x',
    totpEnabledAt: new Date(),
  };

  it('returns the person and the two-step flag for the right password', async () => {
    results = [[row]];
    const out = await repo.systemCheckSignInPassword(' ME@sbc.in ', 'right-password');
    expect(out?.id).toBe(ME);
    expect(out?.twoStepOn).toBe(true);
    expect(params(calls[0])).toEqual(['me@sbc.in']);
  });

  it('answers null alike for a wrong password, an unknown email and an inactive account', async () => {
    results = [[row]];
    expect(await repo.systemCheckSignInPassword('me@sbc.in', 'wrong')).toBeNull();
    results = [[]];
    expect(await repo.systemCheckSignInPassword('nobody@sbc.in', 'right-password')).toBeNull();
    results = [[{ ...row, status: 'inactive' }]];
    expect(await repo.systemCheckSignInPassword('me@sbc.in', 'right-password')).toBeNull();
    results = [[{ ...row, role: 'intern', internId: null }]];
    expect(await repo.systemCheckSignInPassword('me@sbc.in', 'right-password')).toBeNull();
  });

  it('treats an unconfirmed secret as two-step off', async () => {
    results = [[{ ...row, totpEnabledAt: null }]];
    expect((await repo.systemCheckSignInPassword('me@sbc.in', 'right-password'))?.twoStepOn).toBe(false);
  });
});

describe('systemSignInTwoStep', () => {
  it('answers from the email alone: the secret for an active two-step account, null otherwise', async () => {
    results = [[{ id: ME, status: 'active', totpSecretEnc: 't1:x', totpEnabledAt: new Date() }]];
    expect(await repo.systemSignInTwoStep(' ME@sbc.in ')).toEqual({ id: ME, totpSecretEnc: 't1:x' });
    expect(params(calls[0])).toEqual(['me@sbc.in']);
    results = [[{ id: ME, status: 'active', totpSecretEnc: 't1:x', totpEnabledAt: null }]];
    expect(await repo.systemSignInTwoStep('me@sbc.in')).toBeNull();
    results = [[{ id: ME, status: 'inactive', totpSecretEnc: 't1:x', totpEnabledAt: new Date() }]];
    expect(await repo.systemSignInTwoStep('me@sbc.in')).toBeNull();
    results = [[]];
    expect(await repo.systemSignInTwoStep('nobody@sbc.in')).toBeNull();
  });
});

describe('listStaffPeople two-step flag', () => {
  it('tells the firm admin whose two-step sign-in is on, so the reset shows only for them', async () => {
    results = [
      [
        { id: TARGET, name: 'Asha', email: 'asha@sbc.in', role: 'manager', internId: null, clientId: null, reportsToManagerId: null, status: 'active', totpEnabledAt: new Date() },
        { id: ME, name: '', email: 'dev@sbc.in', role: 'developer', internId: null, clientId: null, reportsToManagerId: null, status: 'active', totpEnabledAt: null },
      ],
    ];
    const rows = await repo.listStaffPeople(ctx('admin'));
    expect(rows.map((r) => [r.email, r.role, r.twoStepOn])).toEqual([
      ['asha@sbc.in', 'manager', true],
      ['dev@sbc.in', 'developer', false],
    ]);
    expect(rows[1]!.name).toBe('dev@sbc.in');
  });

  it('refuses a manager', async () => {
    await expect(repo.listStaffPeople(ctx('manager'))).rejects.toThrow('Only firm admins');
  });
});
