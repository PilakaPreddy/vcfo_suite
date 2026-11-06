import { describe, expect, it, vi } from 'vitest';
import type { LlmRequest } from '@/lib/ask/provider';
import { catalogEntry } from '@/lib/ask/field-catalog';
import { candidatesFor } from './candidates';
import { chooseFields } from './choose';

const value = (label: string, val: string, person: string | null = null) => ({ label, value: val, page: null, person, confidence: 1 });

describe('candidatesFor', () => {
  it('settles a unique exact name with no model', () => {
    expect(candidatesFor(value('CIN', 'U62011KA2024PTC123456'), null).exact?.key).toBe('company.cin');
    expect(candidatesFor(value('Date of birth', '03/04/1985', 'Asha'), 'director').exact?.key).toBe('director.dob');
  });

  it('sends a PAN to the person when there is one, and to the company when there is not', () => {
    expect(candidatesFor(value('PAN', 'ABCDE1234F', 'Asha Rao'), 'director').exact?.key).toBe('director.pan');
    expect(candidatesFor(value('PAN', 'ABCDE1234F'), null).exact?.key).toBe('company.pan');
  });

  it('lets the shape of a value rule out other kinds of field', () => {
    const { candidates } = candidatesFor(value('Tax number', 'ABCDE1234F', 'Asha Rao'), 'director');
    expect(candidates.every((c) => c.format === 'pan')).toBe(true);
  });

  it('never offers a file field or a field with no place to write', () => {
    const { candidates } = candidatesFor(value('Copy of PAN card', 'x', 'Asha'), 'director');
    expect(candidates.some((c) => c.format === 'file')).toBe(false);
    expect(candidatesFor(value('GSTIN', '29ABCDE1234F1Z5'), null).candidates.some((c) => c.key === 'company.gstin')).toBe(false);
  });

  it('has nothing to offer for a label the catalog does not know', () => {
    expect(candidatesFor(value('Favourite colour', 'blue'), null).candidates).toEqual([]);
  });
});

describe('chooseFields', () => {
  const dob = catalogEntry('director.dob')!;
  const father = catalogEntry('director.father_name')!;
  const inputs = [
    { value: value('Birth', '03/04/1985', 'Asha'), candidates: [dob] },
    { value: value('Father', 'Ram', 'Asha'), candidates: [father] },
    { value: value('Other', 'x', 'Asha'), candidates: [dob, father] },
  ];
  const reply = (picks: unknown) =>
    ({ name: 'mock', complete: vi.fn(async (req: LlmRequest) => ({ model: req.model, content: [{ type: 'text', text: JSON.stringify({ picks }) }], stopReason: 'end_turn', usage: {} })) }) as never;

  it('lists the candidates as an enum, so the schema itself limits the answer', async () => {
    const provider = reply([]) as { complete: ReturnType<typeof vi.fn> };
    await chooseFields(provider as never, 'claude-haiku-5-5', inputs);
    const req = provider.complete.mock.calls[0]![0] as LlmRequest;
    const schema = req.outputSchema as { properties: { picks: { items: { properties: { key: { enum: string[] } } } } } };
    expect(schema.properties.picks.items.properties.key.enum.sort()).toEqual(['director.dob', 'director.father_name', 'none']);
  });

  it('ignores a pick outside that value\'s own list, and "none"', async () => {
    const chosen = await chooseFields(
      reply([
        { index: 0, key: 'director.dob' },
        { index: 1, key: 'director.dob' },
        { index: 2, key: 'none' },
        { index: 9, key: 'director.dob' },
      ]),
      'm',
      inputs,
    );
    expect([...chosen.keys()]).toEqual([0]);
  });

  it('masks identity numbers in what it sends', async () => {
    const provider = reply([]) as { complete: ReturnType<typeof vi.fn> };
    await chooseFields(provider as never, 'm', [{ value: value('Number', 'ABCDE1234F', 'Asha'), candidates: [dob] }]);
    expect(JSON.stringify((provider.complete.mock.calls[0]![0] as LlmRequest).messages)).not.toContain('ABCDE1234F');
  });

  it('makes no call when there is nothing to choose', async () => {
    const provider = reply([]) as { complete: ReturnType<typeof vi.fn> };
    expect((await chooseFields(provider as never, 'm', [])).size).toBe(0);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});
