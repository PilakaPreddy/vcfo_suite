import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { listBatches, listDocuments, listUploads } from '@/db/repositories/labour-registers';
import { monthPeriod } from '@/lib/labour-registers/catalogue';
import type { ClientRegistersPageProps } from './ClientRegistersPage';

/**
 * What the client's own registers screen needs, read from their own batches.
 *
 * The screen has always taken these four answers as props and the route passed none of them,
 * so every client saw the same page: the map lit for every configured state rather than the
 * ones they employ in, every row saying SBC was preparing it, and no download link on any row
 * however long ago the registers were produced. The component was right; nobody fed it.
 *
 * Everything here comes from `listBatches`, which is already scoped to what the caller may
 * see, so a client reads their own engagement's batches and nothing else. There is no separate
 * record of where a client employs people: a batch exists for a state because somebody opened
 * one to prepare that state's registers, which is the same fact.
 *
 * **Readiness is per form, not per period.** A row offers a download when a document exists
 * for that form, and says it is being prepared when one does not. A single ready flag over the
 * whole month would offer twenty-nine links where twenty-eight files exist, and a link that
 * 404s is worse than a row that says it is not ready.
 */
export type ClientRegistersView = Omit<ClientRegistersPageProps, 'shellBase'>;

/** The tenth of the month after the period, which is when the state returns fall due. */
function dueBy(period: { to: string }): string {
  const end = new Date(`${period.to}T00:00:00Z`);
  const due = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 10));
  return due.toISOString().slice(0, 10);
}

export async function loadClientRegistersView(
  ctx: AuthContext,
  options: { stateCode?: string; period?: string } = {},
): Promise<ClientRegistersView> {
  const batches = await listBatches(ctx);

  /* The states this client employs in, newest batch first, de-duplicated but order kept: the
     state they most recently had registers prepared for is the one they are looking for. */
  const establishments: string[] = [];
  for (const batch of batches) {
    if (!establishments.includes(batch.stateCode)) establishments.push(batch.stateCode);
  }

  const selected = options.stateCode && establishments.includes(options.stateCode)
    ? options.stateCode
    : establishments[0];

  /* The period the screen is showing. It parses the same way the screen does, and defaults to
     last month, because this month's registers cannot exist until this month has ended. */
  const match = /^(\d{4})-(\d{2})$/.exec(options.period ?? '');
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = match ? Number(match[1]) : previous.getUTCFullYear();
  const month = match ? Number(match[2]) : previous.getUTCMonth() + 1;
  const period = monthPeriod(year, Math.min(Math.max(month, 1), 12));

  const batch = selected
    ? batches.find((b) => b.stateCode === selected && b.periodFrom === period.from && b.periodTo === period.to)
    : undefined;

  if (!batch) {
    return { establishments, ready: false, stateCode: selected, period: options.period };
  }

  const [documents, uploads] = await Promise.all([
    listDocuments(ctx, batch.id),
    listUploads(ctx, batch.id),
  ]);

  /* One document per form, the workbook rather than the printout: a client opening a register
     wants the file they can read, and the signing copy is the firm's working artefact. The
     list is newest first, so the first seen for a form is the current one. */
  const documentsByForm: Record<string, string> = {};
  for (const doc of documents) {
    if (doc.format !== 'xlsx') continue;
    if (!documentsByForm[doc.formId]) documentsByForm[doc.formId] = doc.id;
  }
  for (const doc of documents) {
    if (!documentsByForm[doc.formId]) documentsByForm[doc.formId] = doc.id;
  }

  /* What is pending with the client. Only the paysheet, because that is the one input nobody
     else can supply and the one whose absence stops every wage register. Naming more would
     turn a useful nudge into a list the client cannot act on. */
  const hasPaysheet = uploads.some((u) => u.slot === 'paysheet');
  const awaiting = !batch.markedReadyAt && !hasPaysheet
    ? { what: 'The payroll sheet for this period', by: dueBy(period) }
    : undefined;

  return {
    establishments,
    stateCode: selected,
    period: options.period,
    ready: Object.keys(documentsByForm).length > 0,
    batchId: batch.id,
    documentsByForm,
    awaiting,
  };
}
