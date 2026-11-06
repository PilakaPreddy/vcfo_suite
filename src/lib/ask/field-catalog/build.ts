import { checklist, getActiveCatalogItems, type ChecklistField } from '@/data/checklist';
import { obligationInputs, subjectInputs, type InputField } from '@/data/compliance-inputs';
import { QUESTIONNAIRE_SECTIONS } from '@/data/compliance-questionnaire';
import { registrationRule, RULED_REGISTRATIONS } from '@/data/registration-rules';
import { COMPLIANCE_OBLIGATIONS } from '@/lib/compliance/obligations-seed';
import { CLIENT_RESPONSE_FIELDS } from '@/lib/checklist/checklist-responses';
import { CANONICAL_RULES, FORMAT_BY_FIELD_ID, type CanonicalRule } from './rules';
import type { CatalogEntry, FieldFormat, FieldUse } from './types';

/**
 * Builds the catalog from the source files. Retired steps (`pre-6`, `pre-8`, `reg-2`) keep their stored
 * answers but take no new ones, so they are left out; `npm run ask:catalog` writes the result.
 */

export const normalizeLabel = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function formatOf(field: ChecklistField): FieldFormat {
  const byId = FORMAT_BY_FIELD_ID.find(([pattern]) => pattern.test(field.id));
  if (byId) return byId[1];
  if (field.type === 'date') return 'date';
  if (field.type === 'file') return 'file';
  if (field.type === 'select' || field.type === 'segmented') return 'choice';
  if (field.type === 'textarea') return 'longtext';
  return 'text';
}

const specOf = (spec: string): RegExp => new RegExp(`^${spec.replace(/\./g, '\\.').replace(/#/g, '\\d+')}$`);

function plainOptions(field: ChecklistField): Pick<CatalogEntry, 'options'> {
  return field.options?.length ? { options: field.options.map(({ value, label }) => ({ value, label })) } : {};
}

export function buildFieldCatalog(): CatalogEntry[] {
  const entries = new Map<string, CatalogEntry>();
  const rules = CANONICAL_RULES.map((rule) => ({ rule, patterns: rule.fields.map(specOf) }));
  const put = (entry: CatalogEntry) => entries.set(entry.key, entry);
  const fromRule = (rule: CanonicalRule, field?: ChecklistField): CatalogEntry => ({
    key: rule.key,
    label: rule.label,
    synonyms: [...new Set([...rule.synonyms, normalizeLabel(rule.label), ...(field ? [normalizeLabel(field.label)] : [])])],
    format: rule.format ?? (field ? formatOf(field) : 'text'),
    sensitivity: rule.sensitivity ?? 'normal',
    subject: rule.subject,
    ...(field ? plainOptions(field) : {}),
    ...(rule.expands ? { expands: rule.expands } : {}),
    uses: [],
  });
  for (const rule of CANONICAL_RULES) put(fromRule(rule));

  const addField = (stepId: string, field: ChecklistField, repeat?: string) => {
    const spec = `${stepId}/${repeat ? `${repeat}.` : ''}${field.id}`;
    const hit = rules.find(({ patterns }) => patterns.some((p) => p.test(spec)));
    const use: FieldUse = { source: 'checklist', ref: stepId, field: field.id.replace(/\d+(?=[A-Z])/, '#'), ...(repeat ? { repeat } : {}) };
    if (hit) {
      const seen = entries.get(hit.rule.key)!;
      const merged = seen.uses.length === 0 ? fromRule(hit.rule, field) : seen;
      merged.uses = seen.uses;
      if (!merged.uses.some((u) => u.ref === use.ref && u.field === use.field && u.repeat === use.repeat)) merged.uses.push(use);
      put(merged);
      return;
    }
    const label = normalizeLabel(field.label);
    put({
      key: `${stepId}.${repeat ? `${repeat}.` : ''}${field.id}`,
      label: field.label,
      synonyms: [label],
      format: formatOf(field),
      sensitivity: 'normal',
      subject: 'general',
      ...plainOptions(field),
      uses: [{ source: 'checklist', ref: stepId, field: field.id, ...(repeat ? { repeat } : {}) }],
    });
  };

  const active = new Set(getActiveCatalogItems().map((item) => item.id));
  for (const item of checklist) {
    if (!active.has(item.id)) continue;
    for (const field of CLIENT_RESPONSE_FIELDS[item.id] ?? []) {
      if (field.type === 'repeat' && field.entryFields) {
        for (const entry of field.entryFields) addField(item.id, entry, field.id);
      } else {
        addField(item.id, field);
      }
    }
  }

  const addInput = (source: FieldUse['source'], ref: string, input: InputField) => {
    const label = normalizeLabel(input.label);
    const rule = CANONICAL_RULES.find((r) => r.inputs?.includes(input.key) || (r.inputs && r.synonyms.includes(label)));
    const key = rule?.key ?? `${source}.${label.replace(/ /g, '_')}`;
    const seen =
      entries.get(key) ??
      ({ key, label: input.label, synonyms: [label], format: 'text', sensitivity: 'normal', subject: 'general', uses: [] } satisfies CatalogEntry);
    if (!seen.synonyms.includes(label)) seen.synonyms.push(label);
    if (!seen.uses.some((u) => u.source === source && u.ref === ref && u.field === input.key)) seen.uses.push({ source, ref, field: input.key });
    put(seen);
  };

  for (const obligation of COMPLIANCE_OBLIGATIONS) {
    const inputs = obligationInputs(obligation.id, obligation.complianceArea);
    for (const input of [...inputs.client, ...inputs.sbc]) addInput('compliance', obligation.id, input);
  }
  for (const stepId of RULED_REGISTRATIONS) {
    const inputs = subjectInputs('registration', { stepId });
    for (const input of [...inputs.client, ...inputs.sbc]) addInput('registration', stepId, input);
    const trigger = registrationRule(stepId)?.trigger;
    if (trigger) {
      const label = `${checklist.find((c) => c.id === stepId)?.title ?? stepId} date`;
      addInput('registration', stepId, { key: trigger, label });
      entries.get(`registration.${normalizeLabel(label).replace(/ /g, '_')}`)!.format = 'date';
    }
  }
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const question of section.questions) {
      put({
        key: `questionnaire.${question.id}`,
        label: question.label,
        synonyms: [normalizeLabel(question.label)],
        format: question.kind === 'number' ? 'amount' : 'choice',
        sensitivity: 'normal',
        subject: 'company',
        uses: [{ source: 'questionnaire', ref: section.id, field: question.id }],
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
}
