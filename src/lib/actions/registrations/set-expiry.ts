import 'server-only';

import { z } from 'zod';
import { deleteExpiryItem, ExpiryError, findExpiryItem, upsertExpiryItem, type ExpiryMatch } from '@/db/repositories/expiry-items';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { EXPIRY_KIND_LABEL, EXPIRY_KINDS, shortDate, type ExpirySource } from '@/lib/expiries/model';
import { dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * Adds or updates one item on the expiry tracker from the chat ("Ravi's DSC expires 12 March
 * 2027"). It is the same `upsertExpiryItem` the Expiries page calls, with the source `ask`, so the
 * daily backfill no longer overwrites the date. An item with the same client, kind and name is
 * updated; otherwise one is added. A changed date starts the T-60, T-30 and T-7 alerts again.
 */

const input = z.object({
  engagementId: z.string().min(1),
  kind: z.enum(EXPIRY_KINDS),
  /** The director's name, or the company's name for a registration. */
  subjectName: z.string().trim().min(1).max(160),
  expiresOn: dayInput,
  /** "DIN 01234567", "FSSAI 1234…", or what an "other" item is. */
  referenceLabel: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** The date as the person said it, shown on the card. */
  value: z.string(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  itemId: string;
  engagementId: string;
  kind: Input['kind'];
  /** The item before the change; null when the card added it. */
  previous: { expiresOn: string; source: ExpirySource; subjectName: string; referenceLabel: string | null; notes: string | null } | null;
}

const validDay = (iso: string) => !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

async function current(actx: ActionContext, i: Input): Promise<ExpiryMatch> {
  return findExpiryItem(actx.auth, { engagementId: i.engagementId, kind: i.kind, subjectName: i.subjectName });
}

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  checks.push(validDay(i.expiresOn) ? { rule: 'date', ok: true } : { rule: 'date', ok: false, message: 'Held: that is not a real date.' });
  const match = await current(actx, i);
  const existing = match.item;
  if (match.empty) checks.push({ rule: 'subject', ok: false, message: 'Held: the name has no letters or digits to match on. Give the name in English letters.' });
  else if (match.ambiguous.length > 1) {
    checks.push({ rule: 'subject', ok: false, message: `Held: more than one ${EXPIRY_KIND_LABEL[i.kind]} matches "${i.subjectName}" (${match.ambiguous.join(', ')}). Give the full name.` });
  }
  // The card names the stored person or company whose date changes, not the name typed.
  const what = `${existing?.subjectName ?? i.subjectName}'s ${i.kind === 'other' && i.referenceLabel ? i.referenceLabel : EXPIRY_KIND_LABEL[i.kind]}`;
  const newText = validDay(i.expiresOn) ? shortDate(i.expiresOn) : i.value;
  return recheckOf(checks, {
    oldValue: existing?.expiresOn ?? '',
    value: i.expiresOn,
    displayOld: existing ? `Expires ${shortDate(existing.expiresOn)}` : '',
    displayNew: `${what} expires ${newText} (${loaded.companyName})`,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  if (!validDay(i.expiresOn)) return { ok: false, error: 'That is not a real date.' };
  const match = await current(actx, i);
  if (match.empty) return { ok: false, error: 'The name has no letters or digits to match on.' };
  if (match.ambiguous.length > 1) return { ok: false, error: `More than one item matches: ${match.ambiguous.join(', ')}. Give the full name.` };
  const existing = match.item;
  try {
    const { item, previous } = await upsertExpiryItem(actx.auth, {
      id: existing?.id,
      engagementId: i.engagementId,
      kind: i.kind,
      subjectName: existing?.subjectName ?? i.subjectName,
      referenceLabel: i.referenceLabel,
      expiresOn: i.expiresOn,
      notes: i.notes,
      source: 'ask',
    });
    const undo: UndoData = {
      itemId: item.id,
      engagementId: i.engagementId,
      kind: item.kind,
      previous: previous
        ? { expiresOn: previous.expiresOn, source: previous.source, subjectName: previous.subjectName, referenceLabel: previous.referenceLabel, notes: previous.notes }
        : null,
    };
    return { ok: true, summary: `${item.subjectName}'s ${item.kindLabel} now expires ${shortDate(item.expiresOn)}`, undo: undo as unknown as JsonValue };
  } catch (error) {
    if (error instanceof ExpiryError) return { ok: false, error: error.code === 'invalid' ? 'That date or name is not valid.' : 'This project is not available.' };
    throw error;
  }
}

/** Removes an item the card added, or puts back the date, source and name it replaced. */
async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  try {
    if (!data.previous) {
      await deleteExpiryItem(actx.auth, data.itemId);
      return { ok: true, summary: 'Removed the expiry item' };
    }
    await upsertExpiryItem(actx.auth, { id: data.itemId, engagementId: data.engagementId, kind: data.kind, ...data.previous });
    return { ok: true, summary: `Put the expiry back to ${shortDate(data.previous.expiresOn)}` };
  } catch (error) {
    if (error instanceof ExpiryError) return { ok: false, error: 'The expiry item is no longer there.' };
    throw error;
  }
}

export const setExpiry = defineAction({
  name: 'registrations.setExpiry',
  description:
    "Add or update an expiry on the tracker: a director's DSC or DIR-3 KYC, or a company registration (GST, PF, ESI, PT, Shops & Establishment, FSSAI, trade licence, IEC, MSME, LEI). Use it when someone says when something expires, for example \"Ravi's DSC expires 12 March 2027\". A person approves it.",
  capability: 'Record when a DSC, DIR-3 KYC or registration expires, so renewal alerts go out on time (after you approve it)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  examples: [{ engagementId: 'e1', kind: 'dsc', subjectName: 'Ravi Kumar', expiresOn: '2027-03-12', value: '12 March 2027' }],
  async preview(actx, i) {
    const checked = await check(actx, i);
    const { value: _value, ...target } = i;
    return oneRow({
      title: 'Expiry date',
      tier: 'T2',
      engagementId: i.engagementId,
      action: 'registrations.setExpiry',
      target: jsonTarget(target),
      label: `${EXPIRY_KIND_LABEL[i.kind]} expiry`,
      checked,
    });
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
