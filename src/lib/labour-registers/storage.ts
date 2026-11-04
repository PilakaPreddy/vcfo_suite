/**
 * LABOUR REGISTERS — where a file lives, and what it is called.
 *
 * Two kinds of object: the sheets a client uploaded, and the registers produced from them.
 * Both sit under one prefix so a batch's whole evidence trail is one listing.
 *
 * **A produced register is content-addressed in its key, not just in its row.** The cache key
 * is part of the path, so a rebuild under a new key writes a new object rather than
 * overwriting the old one. That matters because an attested document may never be replaced —
 * rule 72 of the OSH (Central) Rules forbids destroying a register after its retention period
 * unless it has been properly transferred, and a correction is issued as a new document that
 * supersedes the old one. Keying the path removes the possibility of an overwrite by accident
 * as well as by intent.
 *
 * The keys are raw rather than going through `bucketKey`. `labourRegisterUploads.objectKey` is
 * already documented as a raw S3 key and `StorageBucket` has no member for this feature; adding
 * one would change what the existing upload route writes.
 */
import type { FormSpec } from '@/data/labour-registers/types';
import type { Period } from './catalogue';

const ROOT = 'labour-registers';

/** Where a produced register lives. The cache key is in the path, so nothing is overwritten. */
export function documentObjectKey(input: {
  engagementId: string;
  batchId: string;
  formId: string;
  cacheKey: string;
  format: string;
}): string {
  return `${ROOT}/${input.engagementId}/${input.batchId}/${input.formId}/${input.cacheKey.slice(0, 32)}.${input.format}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep-2026", or "Jul-2026 to Sep-2026" for a quarter. */
function periodStamp(period: Period): string {
  const from = new Date(`${period.from}T00:00:00Z`);
  const to = new Date(`${period.to}T00:00:00Z`);
  const stamp = (d: Date) => `${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
  if (Number.isNaN(from.getTime())) return period.from;
  if (Number.isNaN(to.getTime()) || stamp(from) === stamp(to)) return stamp(from);
  return `${stamp(from)} to ${stamp(to)}`;
}

/** The period, as a person reads it: "September 2026". */
export function periodLabel(period: Period): string {
  const from = new Date(`${period.from}T00:00:00Z`);
  const to = new Date(`${period.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return `${period.from} to ${period.to}`;
  const long = (d: Date) =>
    `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!Number.isNaN(to.getTime()) && long(from) === long(to)) return long(from);
  return `${period.from} to ${period.to}`;
}

/**
 * What the file is called once it has left this system.
 *
 * Written out rather than abbreviated, because the name is what identifies the form after it
 * has been forwarded to an inspector or a client and the catalogue is no longer to hand.
 */
export function documentFileName(form: FormSpec, period: Period, format = 'xlsx'): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${safe(`Form ${form.formNumber} - ${form.title}`)} - ${periodStamp(period)}.${format}`;
}

/** The name of the act-wise archive of a whole batch. */
export function batchZipName(stateName: string, period: Period): string {
  const safe = stateName.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${safe} labour registers - ${periodStamp(period)}.zip`;
}
