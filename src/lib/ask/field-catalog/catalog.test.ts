import { describe, expect, it } from 'vitest';
import { checklist, getActiveCatalogItems } from '@/data/checklist';
import { CLIENT_RESPONSE_FIELDS } from '@/lib/checklist/checklist-responses';
import { buildFieldCatalog } from './build';
import { catalogEntry, entryForField, FIELD_CATALOG, writableUses } from './index';

describe('field catalog', () => {
  it('matches its source files: run `npm run ask:catalog` when this fails', () => {
    expect(FIELD_CATALOG).toEqual(buildFieldCatalog());
  });

  it('holds every field of every active step', () => {
    const active = new Set(getActiveCatalogItems().map((item) => item.id));
    for (const item of checklist.filter((c) => active.has(c.id))) {
      for (const field of CLIENT_RESPONSE_FIELDS[item.id] ?? []) {
        if (field.type === 'repeat' && field.entryFields) {
          for (const entry of field.entryFields) expect(entryForField(item.id, entry.id, field.id), `${item.id} ${entry.id}`).toBeDefined();
        } else {
          expect(entryForField(item.id, field.id), `${item.id} ${field.id}`).toBeDefined();
        }
      }
    }
  });

  it('marks identity numbers as sensitive and gives them their format', () => {
    for (const [key, format] of [['director.pan', 'pan'], ['director.aadhaar', 'aadhaar'], ['director.passport', 'passport'], ['director.din', 'din'], ['company.pan', 'pan']] as const) {
      expect(catalogEntry(key)).toMatchObject({ format, sensitivity: 'identity' });
    }
  });

  it('joins every step that holds one fact under one key', () => {
    const uses = catalogEntry('director.first_name')!.uses.map((u) => `${u.ref}/${u.field}`);
    expect(uses).toContain('pre-15/firstName');
    expect(uses).toContain('pre-1/director#FirstName');
    expect(catalogEntry('company.cin')!.uses.map((u) => u.source)).toEqual(expect.arrayContaining(['checklist', 'compliance']));
    expect(catalogEntry('company.gstin')!.uses.some((u) => u.source === 'registration')).toBe(true);
  });

  it('never offers a registration, a numbered slot or a workflow stamp as a place to write', () => {
    expect(writableUses(catalogEntry('company.gstin')!)).toEqual([]);
    expect(writableUses(catalogEntry('director.first_name')!).map((u) => u.ref)).toEqual(['pre-15']);
    expect(writableUses(catalogEntry('pre-2.boardResolutionSharedAt')!)).toEqual([]);
  });

  it('holds no login, one-time code or signing PIN field', () => {
    const banned = /password|otp\b|dsc ?pin|portal token/i;
    expect(FIELD_CATALOG.filter((entry) => banned.test(entry.key) || banned.test(entry.label))).toEqual([]);
  });
});
