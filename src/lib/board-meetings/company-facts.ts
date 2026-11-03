import { getItem } from '@/data/checklist';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { registeredOfficeCompleteAddress } from '@/lib/checklist/registered-office-responses';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';

/**
 * The company as the incorporation steps record it, for the notice and its footer: the legal
 * name from the Certificate of Incorporation step (`pre-12`), else the MCA-approved name
 * (`pre-5`); the CIN (`pre-12`); and the registered office (`pre-14`). Empty values are null,
 * so the caller falls back to the project's own fields.
 */
export interface CompanyFacts {
  legalName: string | null;
  cin: string | null;
  registeredOffice: string | null;
}

type State = Record<string, ChecklistItemStateSlice | undefined> | null | undefined;

function responsesOf(state: State, itemId: string): Record<string, string> {
  const item = getItem(itemId);
  return item && state ? extractItemResponses(item, state[itemId]) : {};
}

const text = (v: string | undefined | null) => (v ?? '').trim() || null;

export function companyFactsFromState(state: State): CompanyFacts {
  const coi = responsesOf(state, 'pre-12');
  const approval = responsesOf(state, 'pre-5');
  const office = responsesOf(state, 'pre-14');
  return {
    legalName: text(coi.incorporatedCompanyName) ?? text(approval.approvedCompanyName),
    cin: text(coi.cin),
    registeredOffice: text(registeredOfficeCompleteAddress(office)),
  };
}
