import { describe, expect, it } from 'vitest';
import { alertCopy, daysUntil, dir3KycDueOn, dueAlertStage, expiryBand, filingsAfterDscExpiry, leiNextExpiry, nextExpiryAfterRenewal, stageForDays } from './model';

describe('stages', () => {
  it('maps days left to the T-60, T-30, T-7 and expired stages', () => {
    expect([90, 61, 60, 31, 30, 8, 7, 1, 0, -5].map(stageForDays)).toEqual([null, null, 60, 60, 30, 30, 7, 7, 0, 0]);
  });

  it('alerts each stage once, skips stages already passed and never alerts a renewed item', () => {
    const today = '2026-11-09';
    expect(dueAlertStage({ expiresOn: '2026-12-20', lastAlertStage: null, renewedAt: null }, today)).toBe(60);
    expect(dueAlertStage({ expiresOn: '2026-12-20', lastAlertStage: 60, renewedAt: null }, today)).toBeNull();
    expect(dueAlertStage({ expiresOn: '2026-11-30', lastAlertStage: 60, renewedAt: null }, today)).toBe(30);
    expect(dueAlertStage({ expiresOn: '2026-11-14', lastAlertStage: null, renewedAt: null }, today)).toBe(7);
    expect(dueAlertStage({ expiresOn: '2026-11-09', lastAlertStage: 7, renewedAt: null }, today)).toBe(0);
    expect(dueAlertStage({ expiresOn: '2026-11-01', lastAlertStage: 0, renewedAt: null }, today)).toBeNull();
    expect(dueAlertStage({ expiresOn: '2026-11-10', lastAlertStage: null, renewedAt: new Date() }, today)).toBeNull();
    expect(dueAlertStage({ expiresOn: '2027-06-01', lastAlertStage: null, renewedAt: null }, today)).toBeNull();
  });

  it('bands red at 7 days or expired, amber within 30, green beyond or renewed', () => {
    expect([expiryBand(-3, false), expiryBand(7, false), expiryBand(8, false), expiryBand(30, false), expiryBand(31, false), expiryBand(-3, true)]).toEqual([
      'red', 'red', 'amber', 'amber', 'green', 'green',
    ]);
    expect(daysUntil('2026-11-12', '2026-11-09')).toBe(3);
  });
});

describe('renewal rules', () => {
  it('puts DIR-3 KYC on 30 September, moving to next year once the day has passed', () => {
    expect(dir3KycDueOn('2026-09-30')).toBe('2026-09-30');
    expect(dir3KycDueOn('2026-10-01')).toBe('2027-09-30');
    expect(nextExpiryAfterRenewal('dir3_kyc', '2026-09-30')).toBe('2027-09-30');
  });

  it('rolls LEI yearly and leaves other kinds to the person', () => {
    expect(leiNextExpiry('2024-02-29', '2026-11-09')).toBe('2027-02-28');
    expect(nextExpiryAfterRenewal('lei', '2026-12-01')).toBe('2027-12-01');
    expect(nextExpiryAfterRenewal('dsc', '2026-12-01')).toBeNull();
  });
});

describe('DSC and filings', () => {
  const filings = [
    { particular: 'AOC-4', dueDate: '2026-11-29', filedOn: null },
    { particular: 'MGT-7', dueDate: '2026-12-29', filedOn: null },
    { particular: 'GSTR-1', dueDate: '2026-12-11', filedOn: '2026-12-01' },
    { particular: 'ITR-6', dueDate: '2027-10-31', filedOn: null },
  ];

  it('flags unfiled filings within 90 days due on or after the DSC expiry', () => {
    expect(filingsAfterDscExpiry('2026-12-01', '2026-11-09', filings).map((f) => f.particular)).toEqual(['MGT-7']);
    expect(filingsAfterDscExpiry('2026-11-20', '2026-11-09', filings).map((f) => f.particular)).toEqual(['AOC-4', 'MGT-7']);
  });

  it('names the first blocked filing in the alert text', () => {
    const copy = alertCopy({
      item: { kind: 'dsc', subjectName: 'Ravi Kumar', expiresOn: '2026-11-20' },
      companyName: 'Acme',
      stage: 30,
      days: 11,
      blockedFilings: [{ particular: 'AOC-4', dueDate: '2026-11-29' }, { particular: 'MGT-7', dueDate: '2026-12-29' }],
    });
    expect(copy.title).toBe("Renew within 11 days: Ravi Kumar's DSC");
    expect(copy.body).toContain('It lapses before AOC-4 due 29 Nov 2026 and 1 more');
    expect(copy.taskTitle).toBe("Renew Ravi Kumar's DSC (Acme)");
  });
});
