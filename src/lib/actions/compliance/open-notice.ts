import 'server-only';

import { z } from 'zod';
import { createNoticeCase, deleteNoticeCase, findOpenNoticeByDin } from '@/db/repositories/notice-cases';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { NOTICE_AUTHORITIES, NOTICE_AUTHORITY_LABEL, noticeLabel, noticesHref } from '@/lib/notices/model';
import { formatUploadFileSize, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { fileToVault } from '../documents/file-to-vault';
import { dayInput, findAskAttachment, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * Open a notice case (IDEAS-PLAN wave 2, section C). The fields come from the notice reader
 * (src/lib/notices/read-notice.ts), on a dropped file, an upload on the notice desk, or the chat.
 * It changes shared records (T2): it files the notice in the client's vault, through
 * `documents.fileToVault` itself so the vault path is the same, and creates the case. Undo
 * removes the case and takes the file back out of the vault (the vault's own soft delete).
 */

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const openNoticeInput = z.object({
  engagementId: z.string().min(1),
  /** The notice file the person attached in chat or uploaded on the desk. */
  attachmentId: z.string().uuid().optional(),
  authority: z.enum(NOTICE_AUTHORITIES),
  section: optionalText(60),
  periodLabel: optionalText(60),
  din: optionalText(80),
  /** Rupees, for example "125000.00". */
  demandAmount: z.string().regex(/^\d{1,14}(?:\.\d{1,2})?$/, 'Use rupees like 125000.00').optional(),
  receivedOn: dayInput.optional(),
  responseDueOn: dayInput.optional(),
  hearingOn: dayInput.optional(),
  summary: optionalText(600),
  /** The file name, or the notice's label when there is no file, shown on the card. */
  value: z.string().trim().max(200),
});
type Input = z.infer<typeof openNoticeInput>;

interface UndoData {
  caseId: string;
  vault: JsonValue | null;
}

const TOO_LARGE = `A vault file can be at most ${formatUploadFileSize(MAX_UPLOAD_BYTES)}.`;

/** The case as the card shows it, one fact per line. */
export function describeNotice(i: Pick<Input, 'authority' | 'section' | 'periodLabel' | 'din' | 'demandAmount' | 'receivedOn' | 'responseDueOn' | 'hearingOn' | 'summary'>): string {
  return [
    noticeLabel({ authority: i.authority, section: i.section ?? null, periodLabel: i.periodLabel ?? null }),
    i.din ? `DIN ${i.din}` : null,
    i.demandAmount ? `Demand Rs. ${Number(i.demandAmount).toLocaleString('en-IN')}` : null,
    i.receivedOn ? `Dated ${i.receivedOn}` : null,
    i.responseDueOn ? `Reply due ${i.responseDueOn}` : 'No reply date found: set it on the notice desk',
    i.hearingOn ? `Hearing ${i.hearingOn}` : null,
    i.summary ?? null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  if (i.attachmentId) {
    const file = await findAskAttachment(actx, i.attachmentId);
    if (!file) checks.push({ rule: 'file', ok: false, message: 'Held: the notice file is no longer available.' });
    else if (file.sizeBytes > MAX_UPLOAD_BYTES) checks.push({ rule: 'file', ok: false, message: `Held: ${TOO_LARGE}` });
    else checks.push({ rule: 'file', ok: true });
  }
  if (i.receivedOn && i.responseDueOn && i.responseDueOn < i.receivedOn) checks.push({ rule: 'date', ok: false, message: 'The reply date is before the notice date.' });
  else checks.push({ rule: 'date', ok: true });
  const duplicate = i.din ? await findOpenNoticeByDin(actx.auth, i.engagementId, i.din) : null;
  checks.push(duplicate ? { rule: 'duplicate', ok: false, message: `An open case already has this DIN: ${duplicate.label}.` } : { rule: 'duplicate', ok: true });
  return recheckOf(checks, { oldValue: '', value: i.value, displayOld: '', displayNew: `${describeNotice(i)}\nFor ${loaded.companyName}` });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  const checked = await check(actx, i);
  if (!checked.canApply) return { ok: false, error: checked.heldReason ?? 'This notice cannot be opened.' };
  let vault: JsonValue | null = null;
  let attachment: { documentId: string; fileName: string } | null = null;
  if (i.attachmentId) {
    const file = await findAskAttachment(actx, i.attachmentId);
    const filed = await fileToVault.execute(actx, { engagementId: i.engagementId, attachmentId: i.attachmentId, category: 'Notices', value: file?.fileName ?? i.value });
    if (filed.ok === false) return filed;
    vault = filed.undo ?? null;
    const documentId = (vault as { documentId?: string } | null)?.documentId;
    if (documentId) attachment = { documentId, fileName: file?.fileName ?? i.value };
  }
  try {
    const item = await createNoticeCase(actx.auth, {
      engagementId: i.engagementId,
      authority: i.authority,
      section: i.section,
      periodLabel: i.periodLabel,
      din: i.din,
      demandAmount: i.demandAmount,
      receivedOn: i.receivedOn,
      responseDueOn: i.responseDueOn,
      hearingOn: i.hearingOn,
      summary: i.summary,
      attachments: attachment ? [attachment] : [],
    });
    const undo: UndoData = { caseId: item.id, vault };
    return { ok: true, summary: `Opened ${item.label} for ${item.companyName}`, href: `${noticesHref(actx.auth.role)}?case=${item.id}`, undo: undo as unknown as JsonValue };
  } catch (error) {
    if (vault && fileToVault.undo) await fileToVault.undo(actx, vault).catch(() => undefined);
    throw error;
  }
}

async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  const removed = await deleteNoticeCase(actx.auth, data.caseId);
  if (!removed) return { ok: false, error: 'The case is no longer on the notice desk.' };
  if (data.vault && fileToVault.undo) await fileToVault.undo(actx, data.vault).catch(() => undefined);
  return { ok: true, summary: 'Removed the notice case' };
}

export async function previewOpenNotice(actx: ActionContext, i: Input) {
  const { value: _value, ...target } = i;
  return oneRow({
    title: `Notice desk: ${NOTICE_AUTHORITY_LABEL[i.authority]} notice`,
    tier: 'T2',
    engagementId: i.engagementId,
    action: 'compliance.openNotice',
    target: jsonTarget(target),
    label: 'Notice desk · new case',
    checked: await check(actx, i),
    ...(i.attachmentId ? { source: { kind: 'attachment' as const, attachmentId: i.attachmentId, fileName: i.value } } : {}),
  });
}

export const openNotice = defineAction({
  name: 'compliance.openNotice',
  description:
    'Open a case on the notice desk for a tax, GST, TDS or MCA notice a client received, with its section, period, DIN, demand and dates as read from the notice, and file the notice in the client\'s vault. A person approves it first.',
  capability: 'Open a notice case from a GST, income tax, TDS or MCA notice (after you approve it)',
  input: openNoticeInput,
  tier: 'T2',
  roles: STAFF_ROLES,
  preview: previewOpenNotice,
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
