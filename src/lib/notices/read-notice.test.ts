// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider, LlmRequest } from '@/lib/ask/provider';

vi.mock('@/db/repositories/ask-usage', () => ({ systemRecordAskUsage: vi.fn(), systemTodayTokenTotal: vi.fn(async () => 0) }));

const { appearsIn, extractNoticeFields, parsePrintedAmount, parsePrintedDate, verifyNoticeOutput } = await import('./read-notice');

const NOTICE = `GOVERNMENT OF INDIA
Office of the Superintendent of Central Tax, Hyderabad
DIN: 20261156ZY0000123456
Date: 05/11/2026
FORM GST DRC-01
Show Cause Notice under section 73 of the CGST Act for the period FY 2023-24
To: Acme Technologies Private Limited, GSTIN 36AAACA1234F1Z5, PAN AAACA1234F
Tax demanded: Rs. 1,23,456/-
You are directed to reply by 20-11-2026. A personal hearing is fixed on 25 Nov 2026.`;

function modelReturning(output: unknown): { provider: LlmProvider; seen: LlmRequest[] } {
  const seen: LlmRequest[] = [];
  return {
    seen,
    provider: {
      name: 'mock',
      complete: vi.fn(async (req: LlmRequest) => {
        seen.push(req);
        return { model: req.model, content: [{ type: 'text', text: JSON.stringify(output) }], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } } as never;
      }),
    },
  };
}

const full = {
  authority: 'gst',
  section: '73',
  period: 'FY 2023-24',
  din: '20261156ZY0000123456',
  demand: 'Rs. 1,23,456/-',
  issuedOn: '05/11/2026',
  replyBy: '20-11-2026',
  hearingOn: '25 Nov 2026',
  summary: 'Short payment of tax for FY 2023-24 is alleged. Reply and pay or show cause.',
};

describe('verifyNoticeOutput', () => {
  it('keeps values printed in the notice and turns dates and the demand into data', () => {
    const fields = verifyNoticeOutput(full as never, NOTICE);
    expect(fields).toMatchObject({
      authority: 'gst',
      section: '73',
      periodLabel: 'FY 2023-24',
      din: '20261156ZY0000123456',
      demandAmount: '123456.00',
      receivedOn: '2026-11-05',
      responseDueOn: '2026-11-20',
      hearingOn: '2026-11-25',
    });
  });

  it('drops every value that does not appear in the text', () => {
    const made = { ...full, section: '74', din: 'ABC999', demand: 'Rs. 9,99,999', replyBy: '30/11/2026', period: 'FY 2019-20' };
    const fields = verifyNoticeOutput(made as never, NOTICE);
    expect(fields.section).toBeNull();
    expect(fields.din).toBeNull();
    expect(fields.demandAmount).toBeNull();
    expect(fields.responseDueOn).toBeNull();
    expect(fields.periodLabel).toBeNull();
    // Values that are printed survive beside the dropped ones.
    expect(fields.receivedOn).toBe('2026-11-05');
  });

  it('does not take an authority the text contradicts', () => {
    expect(verifyNoticeOutput({ ...full, authority: 'income_tax' } as never, NOTICE).authority).toBe('gst');
    expect(verifyNoticeOutput({ ...full, authority: 'other' } as never, 'A letter about something').authority).toBe('other');
  });

  it('masks identity numbers in the summary', () => {
    const fields = verifyNoticeOutput({ ...full, summary: 'Issued to PAN AAACA1234F for short payment.' } as never, NOTICE);
    expect(fields.summary).not.toContain('AAACA1234F');
  });
});

describe('printed values', () => {
  it('reads Indian date styles and refuses non-dates', () => {
    expect(parsePrintedDate('05/11/2026')).toBe('2026-11-05');
    expect(parsePrintedDate('5.11.26')).toBe('2026-11-05');
    expect(parsePrintedDate('25th November, 2026')).toBe('2026-11-25');
    expect(parsePrintedDate('November 25, 2026')).toBe('2026-11-25');
    expect(parsePrintedDate('2026-11-05')).toBe('2026-11-05');
    expect(parsePrintedDate('31/02/2026')).toBeNull();
    expect(parsePrintedDate('within 30 days')).toBeNull();
  });

  it('reads rupee amounts', () => {
    expect(parsePrintedAmount('Rs. 1,23,456/-')).toBe('123456.00');
    expect(parsePrintedAmount('₹ 12,500.50')).toBe('12500.50');
    expect(parsePrintedAmount('Rs. 2.5 lakh')).toBe('250000.00');
    expect(parsePrintedAmount('nil')).toBeNull();
  });

  it('compares letters and digits only', () => {
    expect(appearsIn('fy 2023 24', NOTICE)).toBe('fy 2023 24');
    expect(appearsIn('', NOTICE)).toBeNull();
  });
});

describe('extractNoticeFields', () => {
  it('hides identity numbers from the model and keeps only verified values', async () => {
    const { provider, seen } = modelReturning(full);
    const { fields, usedModel } = await extractNoticeFields(NOTICE, { provider, model: 'claude-haiku-5-5' });
    expect(usedModel).toBe(true);
    // The PAN goes as a placeholder; the GSTIN is a public registry number and stays.
    expect(JSON.stringify(seen[0]!.messages)).not.toContain('PAN AAACA1234F');
    expect(JSON.stringify(seen[0]!.messages)).toContain('PAN IDTOKEN1X');
    expect(seen[0]!.outputSchema).toBeTruthy();
    expect(seen[0]!.thinking).toBe('off');
    expect(fields.responseDueOn).toBe('2026-11-20');
    expect(fields.din).toBe('20261156ZY0000123456');
  });

  it('fills only the authority without a model', async () => {
    const { fields, usedModel } = await extractNoticeFields(NOTICE, { provider: null, model: 'm' });
    expect(usedModel).toBe(false);
    expect(fields).toMatchObject({ authority: 'gst', section: null, responseDueOn: null });
  });

  it('refuses an empty text and an unusable reply', async () => {
    await expect(extractNoticeFields('   ', { provider: null, model: 'm' })).rejects.toThrow();
    const { provider } = modelReturning({ nope: true });
    await expect(extractNoticeFields(NOTICE, { provider, model: 'm' })).rejects.toThrow(/could not be read/);
  });
});
