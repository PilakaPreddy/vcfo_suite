import { describe, expect, it } from 'vitest';
import { getRequestTemplate, REQUEST_ITEM_KINDS, REQUEST_TEMPLATES, templateListTitle } from './request-templates';

describe('request templates', () => {
  it('has the five templates the plan names, each with unique ids', () => {
    expect(REQUEST_TEMPLATES.map((t) => t.id)).toEqual(['gst-monthly', 'tds-quarterly', 'roc-annual', 'audit-pbc', 'incorporation-docs']);
    expect(new Set(REQUEST_TEMPLATES.map((t) => t.id)).size).toBe(REQUEST_TEMPLATES.length);
  });

  it('gives every template documents and a sensible cadence', () => {
    for (const t of REQUEST_TEMPLATES) {
      expect(t.items.length).toBeGreaterThanOrEqual(5);
      expect(t.items.some((i) => i.kind === 'document')).toBe(true);
      expect(t.items.every((i) => (REQUEST_ITEM_KINDS as readonly string[]).includes(i.kind) && i.label.trim().length > 5)).toBe(true);
      expect(new Set(t.items.map((i) => i.label)).size).toBe(t.items.length);
      expect(t.cadenceDays).toBeGreaterThanOrEqual(1);
      expect(t.dueInDays).toBeGreaterThan(0);
    }
  });

  it('finds a template and titles a list with its period', () => {
    const gst = getRequestTemplate('gst-monthly')!;
    expect(templateListTitle(gst, 'Oct 2026')).toBe('GST monthly data · Oct 2026');
    expect(templateListTitle(gst, '  ')).toBe('GST monthly data');
    expect(getRequestTemplate('nope')).toBeNull();
  });
});
