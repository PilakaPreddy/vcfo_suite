'use client';

/**
 * Client portal · the obligation and registration record inputs (VCFO Spectrum item-parts,
 * migration 0029):
 *  - `FromClientCard` (C-415, C-491, C-492): the documents SBC asked for on this period or
 *    registration with their status words (Asked, To review, Accepted, Sent back), Upload on
 *    the open ones (the Documents upload dialog, C-416, C-493, then the A1 "uploaded" toast,
 *    C-494) and Download on the accepted ones, then the client's details as inputs with
 *    "Submit details".
 *  - `SbcFieldsCard` (C-417): the values SBC records, read only, identifiers in mono.
 * Data: `/api/compliance-inputs` (the client's own engagement). Before the certificate there is
 * no period yet, so the cards show the empty field list read only.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { fmtDM } from '@/lib/client-portal/compliances';
import type { OpenRequest } from '@/lib/client-portal/documents';
import { MILESTONE_DOCUMENT_EXTENSIONS, maxUploadSizeLabel } from '@/lib/upload-limits';
import type { InputField } from '@/data/compliance-inputs';
import { useInputsAction, useSubjectInputs, type DocWord, type SubjectDoc, type SubjectField } from '@/components/compliances/use-compliance-records';
import { usePortal } from '../../PortalProvider';
import { UploadDialog } from '../documents/UploadDialog';
import { Empty, SCard } from './spectrum';
import '../../css/documents-boards.css';

const DOC_TONE: Record<DocWord, ChipTone> = { Accepted: 'ok', 'To review': 'prog', Asked: 'warn', 'Sent back': 'bad' };

/** R-28: identifiers in mono. */
const isIdentifier = (v: string) => /^[A-Z0-9][A-Z0-9/-]{7,}$/.test(v.trim()) && /\d/.test(v);

function docSub(d: SubjectDoc, today: string): string {
  if (d.status === 'Sent back') return d.note ?? 'Sent back';
  if (d.status === 'Accepted') return d.files[0] ? `Accepted · ${d.files[0].name}` : 'Accepted';
  if (d.status === 'To review') return d.files[0] ? `Uploaded ${fmtDM(d.files[0].uploadedAt.slice(0, 10))}` : 'Uploaded';
  const by = d.askedBy ? `Asked by ${d.askedBy}` : 'Asked by SBC';
  if (d.dueOn) return `${by} · ${d.dueOn < today ? 'was due' : 'due'} ${fmtDM(d.dueOn)}`;
  return by;
}

export function FromClientCard({
  kind,
  subjectKey,
  fallback,
  editable = true,
}: {
  kind: 'obligation' | 'registration';
  /** The filing (instance) id or the registration step id; null before the certificate. */
  subjectKey: string | null;
  /** The field list to show read only when there is no subject yet. */
  fallback?: InputField[];
  editable?: boolean;
}) {
  const { toast } = usePortal();
  const qc = useQueryClient();
  const q = useSubjectInputs({ kind, key: subjectKey, enabled: Boolean(subjectKey) });
  const save = useInputsAction();
  const data = q.data;
  const docs = useMemo(() => data?.docs ?? [], [data]);
  const fields: SubjectField[] = data?.client ?? (fallback ?? []).map((f) => ({ ...f, value: null }));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [upload, setUpload] = useState<string | null>(null);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const canEdit = editable && Boolean(subjectKey) && Boolean(data);

  useEffect(() => {
    if (!data || dirty) return;
    setDraft(Object.fromEntries(data.client.map((f) => [f.key, f.value ?? ''])));
  }, [data, dirty]);

  const open: OpenRequest[] = useMemo(
    () =>
      docs
        .filter((d) => d.status === 'Asked' || d.status === 'Sent back')
        .map((d) => ({ id: d.id, label: d.label, due: d.dueOn ?? undefined, overdue: Boolean(d.dueOn && d.dueOn < today), note: d.note ?? undefined, reupload: d.status === 'Sent back' })),
    [docs, today],
  );
  const accepted = docs.filter((d) => d.status === 'Accepted').length;
  const submitted = Boolean(data?.submittedAt) && !dirty;

  const submit = () => {
    if (!subjectKey) return;
    save.mutate(
      { action: 'save', kind, key: subjectKey, side: 'client', values: Object.fromEntries(fields.map((f) => [f.key, draft[f.key]?.trim() || null])) },
      {
        onSuccess: () => {
          setDirty(false);
          toast('Details sent to SBC');
        },
        onError: () => toast('Could not send the details. Try again.'),
      },
    );
  };

  let body: React.ReactNode;
  if (subjectKey && q.isLoading)
    body = (
      <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading the documents">
        <span className="block h-11 animate-pulse rounded-md bg-surface-sunken" />
      </div>
    );
  else if (subjectKey && q.isError)
    body = (
      <Empty
        action={
          <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        Could not load the documents
      </Empty>
    );
  else
    body = (
      <>
        {docs.map((d) => {
          const ask = d.status === 'Asked' || d.status === 'Sent back';
          const file = d.files[0];
          return (
            <div key={d.id} className="flex min-h-[52px] items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0 md:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{d.label}</span>
                <span className={cn('block truncate text-[12.5px] text-ink-muted', d.status === 'Sent back' && 'text-danger')}>{docSub(d, today)}</span>
              </span>
              <Chip tone={DOC_TONE[d.status]} fixed className="hidden sm:inline-flex">
                {d.status}
              </Chip>
              <span className="flex w-[76px] flex-none justify-end">
                {ask && editable ? (
                  <Button size="sm" onClick={() => setUpload(d.id)}>
                    Upload
                  </Button>
                ) : file ? (
                  <Button size="iconSm" variant="ghost" asChild>
                    <a href={`/api/client/documents/file?ref=${encodeURIComponent(`r:${file.id}`)}&dl=1`} download aria-label={`Download ${d.label}`} title="Download">
                      <Download size={16} strokeWidth={1.6} aria-hidden />
                    </a>
                  </Button>
                ) : null}
              </span>
            </div>
          );
        })}
        {(data?.needs ?? []).map((n) => (
          <div key={`need-${n}`} className="flex min-h-[52px] items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0 md:px-5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink-2">{n}</span>
              <span className="block truncate text-[12.5px] text-ink-muted">SBC asks when this starts</span>
            </span>
          </div>
        ))}
        {!docs.length && !fields.length && !data?.needs?.length ? <Empty /> : null}
        {fields.length ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {fields.map((f) => {
              const v = canEdit ? (draft[f.key] ?? '') : f.value ?? '-';
              const mono = f.mono || (typeof v === 'string' && isIdentifier(v));
              return (
                <label key={f.key} className={cn('grid min-w-0 gap-1 border-t border-line-soft px-4 py-2.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center sm:gap-4 md:px-5', !docs.length && 'first:border-t-0')}>
                  <span className="text-[13px] text-ink-muted">{f.label}</span>
                  {canEdit ? (
                    <Input
                      value={draft[f.key] ?? ''}
                      onChange={(e) => {
                        setDirty(true);
                        setDraft((d) => ({ ...d, [f.key]: e.target.value }));
                      }}
                      className={cn(mono && 'font-mono')}
                    />
                  ) : (
                    <b className={cn('min-w-0 break-words text-[14px] font-medium text-ink', mono && 'font-mono text-[13.5px]', v === '-' && 'font-normal text-ink-faint')}>{v}</b>
                  )}
                </label>
              );
            })}
            {canEdit ? (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft px-4 py-3 md:px-5">
                {data?.confirmedBy && !dirty ? <span className="mr-auto text-[12.5px] text-ink-muted">Confirmed by {data.confirmedBy}</span> : null}
                <Button type="submit" variant={submitted ? 'soft' : 'default'} disabled={submitted || save.isPending}>
                  {save.isPending ? 'Sending' : submitted ? 'Submitted' : 'Submit details'}
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </>
    );

  return (
    <SCard title="From the client" meta={docs.length ? `${accepted} of ${docs.length} accepted` : undefined} flush>
      {body}
      {upload !== null && open.length ? (
        <UploadDialog
          requests={open}
          initialRequestId={upload}
          accept={{ exts: [...MILESTONE_DOCUMENT_EXTENSIONS], maxLabel: maxUploadSizeLabel() }}
          onClose={() => setUpload(null)}
          onUploaded={({ count }) => {
            setUpload(null);
            void qc.invalidateQueries({ queryKey: ['compliance-inputs'] });
            void qc.invalidateQueries({ queryKey: ['client-portal'] });
            const n = count ?? 1;
            toast(`${n} ${n === 1 ? 'file' : 'files'} uploaded`, { kind: 'uploaded', sub: 'SBC reviews them next.' });
          }}
        />
      ) : null}
    </SCard>
  );
}

/** "Filled by SBC": label and value rows, read only (prototype SbcFieldsCard). `extra` rows come first. */
export function SbcFieldsCard({
  kind,
  subjectKey,
  fallback,
  extra = [],
}: {
  kind: 'obligation' | 'registration';
  subjectKey: string | null;
  fallback?: InputField[];
  extra?: Array<{ k: string; v: string | null; mono?: boolean }>;
}) {
  const q = useSubjectInputs({ kind, key: subjectKey, enabled: Boolean(subjectKey) });
  const fields: SubjectField[] = q.data?.sbc ?? (fallback ?? []).map((f) => ({ ...f, value: null }));
  const seen = new Set(extra.map((e) => e.k.toLowerCase()));
  const rows = [
    ...extra,
    ...fields.filter((f) => !seen.has(f.label.toLowerCase())).map((f) => ({ k: f.label, v: f.value, mono: f.mono })),
  ];
  return (
    <SCard title="Filled by SBC" meta="Read only" flush>
      {subjectKey && q.isLoading ? (
        <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading">
          <span className="block h-11 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        rows.map((r) => (
          <div key={r.k} className="grid min-h-[44px] grid-cols-[150px_minmax(0,1fr)] items-center gap-4 border-t border-line-soft px-4 py-2 first:border-t-0 sm:grid-cols-[190px_minmax(0,1fr)] md:px-5">
            <span className="text-[13px] text-ink-muted">{r.k}</span>
            <span className={cn('min-w-0 break-words text-[14px] font-medium text-ink', (r.mono || (r.v && isIdentifier(r.v))) && 'font-mono text-[13.5px]', !r.v && 'font-normal text-ink-faint')}>
              {r.v ?? '-'}
            </span>
          </div>
        ))
      )}
    </SCard>
  );
}

/** The people on a record (C-411, C-481): the client, the project lead and the manager, from the portal shell. */
export function useRecordPeople(): Array<{ name: string; role: string; src?: string | null }> {
  const { shell } = usePortal();
  if (!shell) return [];
  const lead = shell.team.find((t) => t.role === 'Project Lead');
  const manager = shell.team.find((t) => t.role === 'Project Manager');
  return [
    { name: shell.me.name, role: shell.companyShort || 'Client' },
    ...(lead ? [{ name: lead.name, role: 'Project lead', src: lead.avatarUrl ?? null }] : []),
    ...(manager ? [{ name: manager.name, role: 'Manager', src: manager.avatarUrl ?? null }] : []),
  ];
}
