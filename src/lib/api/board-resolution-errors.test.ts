import { describe, expect, it } from 'vitest';

import {
  BOARD_RESOLUTION_ERROR_CODES,
  BoardResolutionError,
  boardResolutionErrorJson,
  collectBoardResolutionMissingFieldRefs,
  collectBoardResolutionMissingFields,
  formatBoardResolutionErrorDisplay,
  isPre1SubmittedForBoardResolution,
  toBoardResolutionError,
  validateBoardResolutionGeneration,
} from '@/lib/api/board-resolution-errors';

const completePre1 = {
  parentEntityName: 'ABC Holdings LLC',
  proposedName1: 'ABC India Private Limited',
  boardResolutionDate: '2026-05-26',
  signatoryFirstName: 'Jane',
  signatoryLastName: 'Doe',
  signatoryDesignation: 'Director',
  authorisedShareCapital: '1000000',
  paidUpShareCapital: '100000',
  nicCode: '62011',
  directorCount: '2',
  director1FirstName: 'Priya',
  director1LastName: 'Sharma',
  director1Gender: 'female',
  director1IndiaResident: 'yes',
  director2FirstName: 'John',
  director2LastName: 'Smith',
  director2Gender: 'male',
  director2IndiaResident: 'no',
};

describe('isPre1SubmittedForBoardResolution', () => {
  it('returns false when Step 1 was never submitted', () => {
    expect(isPre1SubmittedForBoardResolution(undefined)).toBe(false);
    expect(isPre1SubmittedForBoardResolution({ status: 'in-progress' })).toBe(false);
  });

  it('returns true after client submission or acceptance', () => {
    expect(
      isPre1SubmittedForBoardResolution({
        status: 'awaiting-client',
        clientSubmittedAt: '2026-05-20T10:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isPre1SubmittedForBoardResolution({
        status: 'in-progress',
        reviewStatus: 'accepted',
      }),
    ).toBe(true);
    expect(isPre1SubmittedForBoardResolution({ status: 'completed' })).toBe(true);
  });
});

describe('collectBoardResolutionMissingFields', () => {
  it('lists missing merge fields with readable labels', () => {
    const missing = collectBoardResolutionMissingFields({});
    expect(missing).toContain('Parent entity name');
    expect(missing).toContain('Proposed company name (option 1)');
    expect(missing).not.toContain('Board resolution date');
    expect(missing).toContain('Signatory name');
  });

  it('links a missing director to the Part A proposed directors tab', () => {
    const refs = collectBoardResolutionMissingFieldRefs({ directorCount: '2' });
    expect(refs).toContainEqual({
      stepId: 'pre-1',
      fieldId: 'director1FirstName',
      section: 'Proposed Directors',
      label: 'Director 1 first name',
    });
  });

  it('returns empty when required Pre-1 data is present', () => {
    expect(collectBoardResolutionMissingFields(completePre1)).toEqual([]);
  });

  it('accepts parent entity from engagement fallback', () => {
    const missing = collectBoardResolutionMissingFields(
      { ...completePre1, parentEntityName: '' },
      { parentEntityName: 'Fallback Parent Inc.', companyName: 'Fallback Parent Inc.' },
    );
    expect(missing).not.toContain('Parent entity name');
  });
});

describe('validateBoardResolutionGeneration', () => {
  it('requires Step 1 submission before full generate', () => {
    expect(() =>
      validateBoardResolutionGeneration({
        pre1: completePre1,
        pre1State: { status: 'in-progress' },
      }),
    ).toThrow(BoardResolutionError);

    try {
      validateBoardResolutionGeneration({
        pre1: completePre1,
        pre1State: { status: 'in-progress' },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(BoardResolutionError);
      expect((err as BoardResolutionError).code).toBe(
        BOARD_RESOLUTION_ERROR_CODES.STEP1_INCOMPLETE,
      );
    }
  });

  it('reports missing fields after Step 1 is submitted', () => {
    try {
      validateBoardResolutionGeneration({
        pre1: { proposedName1: 'ABC India Private Limited' },
        pre1State: {
          status: 'in-progress',
          clientSubmittedAt: '2026-05-20T10:00:00.000Z',
        },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(BoardResolutionError);
      const brErr = err as BoardResolutionError;
      expect(brErr.code).toBe(BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS);
      expect(brErr.missingFields?.length).toBeGreaterThan(0);
      expect(brErr.message).toMatch(/This data is missing:/);
    }
  });

  it('skips Pre-1 checks when patching an existing document', () => {
    expect(() =>
      validateBoardResolutionGeneration({
        pre1: {},
        pre1State: { status: 'not-started' },
        isPatchOnly: true,
      }),
    ).not.toThrow();
  });

  it('blocks edits when finalized', () => {
    expect(() =>
      validateBoardResolutionGeneration({
        pre1: completePre1,
        pre1State: { status: 'completed', clientSubmittedAt: '2026-05-20T10:00:00.000Z' },
        isFinalized: true,
      }),
    ).toThrow(BoardResolutionError);
  });

  it('allows storage repair when finalized and allowFinalizedRepair is set', () => {
    expect(() =>
      validateBoardResolutionGeneration({
        pre1: completePre1,
        pre1State: { status: 'completed', clientSubmittedAt: '2026-05-20T10:00:00.000Z' },
        isFinalized: true,
        allowFinalizedRepair: true,
      }),
    ).not.toThrow();
  });
});

describe('toBoardResolutionError', () => {
  it('maps template missing messages', () => {
    const err = toBoardResolutionError(
      new Error('Board resolution template missing at /tmp/boardResolution.docx.'),
    );
    expect(err.code).toBe(BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_MISSING);
  });

  it('preserves BoardResolutionError instances', () => {
    const original = new BoardResolutionError('Test', BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS);
    expect(toBoardResolutionError(original)).toBe(original);
  });
});

describe('formatBoardResolutionErrorDisplay', () => {
  it('formats missing field responses for UI', () => {
    const display = formatBoardResolutionErrorDisplay({
      ok: false,
      code: BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS,
      error: 'This data is missing: Parent entity name.',
      missingFields: ['Parent entity name'],
    });
    expect(display.title).toBe('Missing information');
    expect(display.description).toContain('Parent entity name');
  });
});

describe('board resolution NIC check', () => {
  it('lists the NIC code as missing, with a link target', () => {
    const { nicCode: _nic, ...withoutNic } = completePre1;
    expect(collectBoardResolutionMissingFields(withoutNic)).toEqual(['NIC code']);
    expect(collectBoardResolutionMissingFieldRefs(withoutNic)).toEqual([
      { stepId: 'pre-1', fieldId: 'nicCode', section: 'NIC Codes', label: 'NIC code' },
    ]);
  });

  it('carries the refs on the thrown error and in the API body', () => {
    const { nicCode: _nic, ...withoutNic } = completePre1;
    try {
      validateBoardResolutionGeneration({ pre1: withoutNic, pre1State: { status: 'completed' } });
      throw new Error('expected a missing-fields error');
    } catch (err) {
      expect(err).toBeInstanceOf(BoardResolutionError);
      const body = boardResolutionErrorJson(err as BoardResolutionError);
      expect(body.code).toBe(BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS);
      expect(body.missingFields).toEqual(['NIC code']);
      expect(body.missingFieldRefs?.[0]?.fieldId).toBe('nicCode');
    }
  });

  it('asks for Client Details first in plain words', () => {
    expect(() => validateBoardResolutionGeneration({ pre1: completePre1, pre1State: { status: 'in-progress' } })).toThrow(
      'Submit Client Details first. The board resolution uses this data.',
    );
  });
});
