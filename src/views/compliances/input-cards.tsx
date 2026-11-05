'use client';

/**
 * Staff cards of the obligation and registration records built on migration 0029:
 *  - `StaffFromClientCard` (S-774): the documents asked on the period or registration with
 *    their status words, Accept and "Ask again" with a reason on an upload, Ask on a need not
 *    asked yet (and on any new document), then the details the client gave with "Confirm" and
 *    "Confirmed by".
 *  - `StaffSbcFieldsCard` (S-811): the values SBC records; click a value to edit it, Enter or
 *    leaving the field saves it (R-40).
 *  - `AppliesCard` (S-813) and `StartsCard` (S-814): why a registration applies (or why it is
 *    not needed) and the obligations it starts, from `/api/registrations/applicability`.
 * Data: `/api/compliance-inputs`, scoped in the repository; nothing is sample data.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { toastSaved } from '@/components/ui/toast-saved';
import {
  useComplianceStarts,
  useInputsAction,
  useSubjectInputs,
  type DocWord,
  type SubjectDoc,
} from '@/components/compliances/use-compliance-records';
import { isIdentifier, plainDate } from '@/lib/compliance/spectrum-status';

/** Focus a field when it appears (the inline forms open on a click). */
const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

const DOC_TONE: Record<DocWord, ChipTone> = { Accepted: 'ok', 'To review': 'prog', Asked: 'warn', 'Sent back': 'bad' };

function docSub(d: SubjectDoc, now: Date): string {
  if (d.status === 'Sent back') return d.note ? `Asked again · ${d.note}` : 'Asked again';
  const file = d.files[0];
  if (d.status === 'Accepted' || d.status === 'To review') return file ? `${file.name} · uploaded ${plainDate(file.uploadedAt.slice(0, 10), now)}` : 'Uploaded';
  return `Asked ${plainDate(d.askedOn.slice(0, 10), now)}${d.askedBy ? ` by ${d.askedBy}` : ''}${d.dueOn ? ` · due ${plainDate(d.dueOn, now)}` : ''}`;
}

async function downloadRequestFile(fileId: string) {
  const res = await fetch(`/api/work/request-files/${encodeURIComponent(fileId)}`, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !body.url) throw new Error('Could not open the file');
  window.open(body.url, '_blank', 'noopener');
}

export function StaffFromClientCard({
  engagementId,
  kind,
  subjectKey,
  clientName,
}: {
  engagementId: string;
  kind: 'obligation' | 'registration';
  subjectKey: string;
  clientName: string;
}) {
  const now = new Date();
  const q = useSubjectInputs({ engagementId, kind, key: subjectKey });
  const act = useInputsAction();
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(false);
  const [newDoc, setNewDoc] = useState<string | null>(null);
  const data = q.data;
  const docs = data?.docs ?? [];
  const accepted = docs.filter((d) => d.status === 'Accepted').length;
  const filled = (data?.client ?? []).filter((f) => f.value);

  const run = (body: Parameters<typeof act.mutate>[0], done: string) =>
    act.mutate(body, {
      onSuccess: () => toastSaved(done),
      onError: (e) => toastError('Could not save', errorMessage(e)),
    });

  return (
    <DashSection
      title="From the client"
      meta={docs.length ? `${accepted} of ${docs.length} accepted` : undefined}
      right={
        <Button size="sm" variant="secondary" onClick={() => setNewDoc(newDoc === null ? '' : null)} aria-expanded={newDoc !== null}>
          <Plus aria-hidden />
          Ask for a document
        </Button>
      }
      bodyClassName="p-0"
    >
      {newDoc !== null ? (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-surface-sunken px-4 py-2.5 md:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newDoc.trim()) return;
            act.mutate(
              { action: 'ask', engagementId, kind, key: subjectKey, label: newDoc.trim() },
              { onSuccess: () => (setNewDoc(null), toastSaved(`Asked ${clientName}`)), onError: (e2) => toastError('Could not ask', errorMessage(e2)) },
            );
          }}
        >
          <Input aria-label="Document to ask for" ref={focusOnMount} value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="For example: sales register for October" className="min-w-[200px] flex-1" />
          <Button size="sm" type="submit" disabled={!newDoc.trim() || act.isPending}>
            Ask
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setNewDoc(null)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {q.isLoading ? (
        <div className="p-4">
          <SkeletonRows rows={3} />
        </div>
      ) : q.isError ? (
        <p className="px-4 py-3 text-[13px] text-ink-faint">Could not load the documents</p>
      ) : (
        <>
          {docs.map((d) => (
            <div key={d.id} className="border-t border-line-soft first:border-t-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px] md:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{d.label}</span>
                  <span className={cn('block truncate text-[12.5px] text-ink-muted', d.status === 'Sent back' && 'text-danger')}>{docSub(d, now)}</span>
                </span>
                <Chip tone={DOC_TONE[d.status]} fixed className="hidden sm:inline-flex">
                  {d.status}
                </Chip>
                {d.status === 'To review' && asking !== d.id ? (
                  <span className="flex flex-none gap-1.5">
                    <Button size="sm" variant="soft" disabled={act.isPending} onClick={() => run({ action: 'accept', requestId: d.id }, `${d.label} accepted`)}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAsking(d.id);
                        setReason('');
                        setErr(false);
                      }}
                    >
                      Ask again
                    </Button>
                  </span>
                ) : null}
                {d.files[0] && d.status !== 'Sent back' ? (
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Download ${d.label}`}
                    onClick={() => void downloadRequestFile(d.files[0]!.id).catch((e) => toastError('Could not open the file', errorMessage(e)))}
                  >
                    <Download aria-hidden />
                  </Button>
                ) : null}
              </div>
              {asking === d.id ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-surface-sunken px-4 py-2.5 md:px-5">
                  <Input
                    aria-label="Reason"
                    ref={focusOnMount}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setErr(false);
                    }}
                    placeholder="What should the client fix? For example: stamp missing on page 2"
                    className="min-w-[200px] flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() => {
                      if (!reason.trim()) return setErr(true);
                      act.mutate(
                        { action: 'send-back', requestId: d.id, reason: reason.trim() },
                        { onSuccess: () => (setAsking(null), toastSaved(`Asked ${clientName} again`)), onError: (e) => toastError('Could not send', errorMessage(e)) },
                      );
                    }}
                  >
                    Send
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                    Cancel
                  </Button>
                  {err ? <span className="w-full text-[13px] font-medium text-danger">Enter a reason first</span> : null}
                </div>
              ) : null}
            </div>
          ))}
          {(data?.needs ?? []).map((n) => (
            <div key={`need-${n}`} className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-3 text-[13.5px] first:border-t-0 md:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink-2">{n}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">Not asked yet</span>
              </span>
              <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run({ action: 'ask', engagementId, kind, key: subjectKey, label: n }, `Asked ${clientName}`)}>
                Ask
              </Button>
            </div>
          ))}
          {!docs.length && !data?.needs.length && !filled.length ? <p className="px-4 py-3 text-[13px] text-ink-faint">Nothing asked yet</p> : null}
          {data && data.client.length ? (
            <div className="border-t border-line-soft px-4 py-4 md:px-5">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {data.client.map((f) => (
                  <div key={f.key} className="min-w-0">
                    <dt className="text-[12.5px] text-ink-muted">{f.label}</dt>
                    <dd className={cn('text-[14px] text-ink', (f.mono || (f.value && isIdentifier(f.value))) && 'font-mono text-[13.5px]', !f.value && 'text-ink-faint')}>{f.value ?? '-'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">
                  {data.confirmedBy && data.confirmedAt
                    ? `Confirmed by ${data.confirmedBy} · ${plainDate(data.confirmedAt.slice(0, 10), now)}`
                    : data.submittedAt
                      ? `Sent by ${data.submittedBy ?? clientName} · ${plainDate(data.submittedAt.slice(0, 10), now)}`
                      : `${clientName} has not sent the details`}
                </p>
                {data.submittedAt && !data.confirmedAt ? (
                  <Button size="sm" variant="soft" disabled={act.isPending} onClick={() => run({ action: 'confirm', engagementId, kind, key: subjectKey }, 'Details confirmed')}>
                    Confirm
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </DashSection>
  );
}

export function StaffSbcFieldsCard({
  engagementId,
  kind,
  subjectKey,
  locked,
  facts = [],
}: {
  engagementId: string;
  kind: 'obligation' | 'registration';
  subjectKey: string;
  /** After filing the values stay as filed. */
  locked?: boolean;
  /** Read-only facts of the filing shown before the editable values (statutory detail D-2.2: filed on, ARN, amount paid). */
  facts?: Array<{ key: string; label: string; value: string | null; sub?: string | null }>;
}) {
  const q = useSubjectInputs({ engagementId, kind, key: subjectKey });
  const act = useInputsAction();
  const [edit, setEdit] = useState<string | null>(null);
  const rows = q.data?.sbc ?? [];
  const save = (key: string, value: string, before: string | null) => {
    setEdit(null);
    if ((value.trim() || null) === before) return;
    act.mutate(
      { action: 'save', engagementId, kind, key: subjectKey, side: 'sbc', values: { [key]: value.trim() || null } },
      { onSuccess: () => toastSaved('Saved'), onError: (e) => toastError('Could not save', errorMessage(e)) },
    );
  };
  return (
    <DashSection title="Filled by SBC" meta={locked ? 'Locked after filing' : undefined}>
      {q.isLoading ? (
        <SkeletonRows rows={2} />
      ) : q.isError ? (
        <p className="text-[13px] text-ink-faint">Could not load the fields</p>
      ) : rows.length === 0 && facts.length === 0 ? (
        <p className="text-[13px] text-ink-faint">None</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={`fact-${f.key}`} className="min-w-0">
              <dt className="text-[12.5px] text-ink-muted">{f.label}</dt>
              <dd className={cn('truncate text-[14px]', f.value ? 'text-ink' : 'text-ink-faint', f.value && isIdentifier(f.value) && 'font-mono text-[13.5px]')}>
                {f.value ?? '-'}
                {f.sub ? <span className="ml-1.5 font-sans text-[12.5px] text-ink-muted">{f.sub}</span> : null}
              </dd>
            </div>
          ))}
          {rows.map((f) => {
            const mono = f.mono || Boolean(f.value && isIdentifier(f.value));
            return (
              <div key={f.key} className="min-w-0">
                <dt className="text-[12.5px] text-ink-muted">{f.label}</dt>
                <dd className={cn('text-[14px]', mono && 'font-mono text-[13.5px]')}>
                  {edit === f.key && !locked ? (
                    <Input
                      ref={focusOnMount}
                      aria-label={f.label}
                      defaultValue={f.value ?? ''}
                      className={cn('mt-0.5', mono && 'font-mono')}
                      onBlur={(e) => save(f.key, e.target.value, f.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEdit(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setEdit(f.key)}
                      aria-label={`Edit ${f.label}`}
                      className={cn('block max-w-full truncate text-left', f.value ? 'text-ink' : 'text-ink-faint', !locked && 'hover:text-brand-text hover:underline')}
                    >
                      {f.value ?? '-'}
                    </button>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </DashSection>
  );
}

/** Why the registration applies, or why it is not needed (S-813). */
export function AppliesCard({ engagementId, stepId, companyName, notNeeded }: { engagementId: string; stepId: string; companyName: string; notNeeded: boolean }) {
  const q = useComplianceStarts(engagementId);
  const rule = q.data?.byStep[stepId];
  if (!rule) return null;
  const skip = notNeeded || rule.applies === false;
  return (
    <DashSection title={skip ? 'Not needed' : 'Applies because'}>
      <div className="grid gap-2 text-[13.5px] leading-relaxed text-ink-2">
        <p>{skip ? rule.notNeeded : `Applies to ${companyName} because: ${rule.why}`}</p>
        {rule.answers.length ? (
          <ul className="grid gap-0.5 text-ink-muted">
            {rule.answers.map((a) => (
              <li key={a.question}>
                {a.label} <b className="font-medium text-ink">{a.value}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">Not answered in the compliance questionnaire</p>
        )}
        <p className="text-ink-muted">Rule: {rule.rule}</p>
      </div>
    </DashSection>
  );
}

/** The obligations a registration starts, with links to their records (S-814). */
export function StartsCard({ engagementId, stepId, obligationsBase }: { engagementId: string; stepId: string; obligationsBase: string }) {
  const q = useComplianceStarts(engagementId);
  const rule = q.data?.byStep[stepId];
  if (!rule || !rule.starts.length) return null;
  const now = new Date();
  return (
    <DashSection title="What it starts" meta={rule.startsOn ? `From ${plainDate(rule.startsOn, now)}` : `${rule.starts.length}`} bodyClassName="p-0">
      <ul>
        {rule.starts.map((o) => (
          <li key={o.id} className="border-t border-line-soft first:border-t-0">
            <Link
              href={`${obligationsBase}/${encodeURIComponent(o.id)}?company=${encodeURIComponent(engagementId)}`}
              className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-surface-sunken"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.name}</span>
              <span className="flex-none text-[12.5px] text-ink-muted">
                {o.freqLabel} · {o.authorityName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DashSection>
  );
}
