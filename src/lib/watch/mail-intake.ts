import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { systemWatchSourceByUrl, systemEnsureWatchSources } from '@/db/repositories/reg-sources';
import { addPastedAlertMail, systemLogRegNoise, systemQueueAlertMail } from '@/db/repositories/reg-updates';
import { WatchIntakeError } from './intake';
import { onOfficialDomain, parseAlertMail, receiverVouches } from './mail-parse';
import { hostOf, queueWatchProcess } from './process';
import { ALERT_MAIL_SOURCE_URL, WATCH_SOURCES } from './sources-seed';

/**
 * Official alert mail enters the pipeline at the read step, from the mailbox endpoint or pasted by
 * staff. A mail that fails the checks is logged with its reason, so a blocked sender can be found.
 */
async function alertMailSourceId(): Promise<string> {
  const known = await systemWatchSourceByUrl(ALERT_MAIL_SOURCE_URL);
  if (known) return known.id;
  await systemEnsureWatchSources(WATCH_SOURCES);
  return (await systemWatchSourceByUrl(ALERT_MAIL_SOURCE_URL))!.id;
}

export type MailReceipt = { result: 'queued'; id: string } | { result: 'duplicate' } | { result: 'refused'; reason: 'sender_not_allowed' | 'not_authenticated' | 'no_text' };

export async function receiveAlertMail(raw: string): Promise<MailReceipt> {
  const mail = parseAlertMail(raw);
  const sourceId = await alertMailSourceId();
  const reason = !onOfficialDomain(mail.sender) ? 'sender_not_allowed' : !receiverVouches(raw, mail.sender) ? 'not_authenticated' : mail.body ? null : 'no_text';
  if (reason) {
    const item = { externalKey: mail.messageId, title: mail.subject || '(no subject)', url: `mail:${mail.messageId}`, publishedOn: mail.sentOn };
    await systemLogRegNoise(sourceId, [{ item, reason }]);
    return { result: 'refused', reason };
  }
  const id = await systemQueueAlertMail(sourceId, mail);
  if (!id) return { result: 'duplicate' };
  await queueWatchProcess([{ id, host: hostOf(mail.link) }]);
  return { result: 'queued', id };
}

/** A person read the mail, so the From line and allowlist are the check here; headers rarely survive a paste. */
export async function intakePastedMail(ctx: AuthContext, raw: string): Promise<string> {
  const mail = parseAlertMail(raw);
  if (!onOfficialDomain(mail.sender)) throw new WatchIntakeError('Paste the whole email with its From line. It must come from an official address such as one ending in gov.in.');
  if (!mail.subject || !mail.body) throw new WatchIntakeError('Paste the whole email, with its Subject line and text.');
  const id = await addPastedAlertMail(ctx, await alertMailSourceId(), mail);
  if (!id) throw new WatchIntakeError('This email was already added.');
  await queueWatchProcess([{ id, host: hostOf(mail.link) }]);
  return id;
}
