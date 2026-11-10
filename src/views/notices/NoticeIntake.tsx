'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { PanelSection, SidePanel } from '@/components/ui/side-panel';
import { Textarea } from '@/components/ui/textarea';
import { readNoticeFile, useOpenNotice, type NoticeFields, type NoticeReview } from '@/hooks/use-notices';
import { NOTICE_AUTHORITIES, NOTICE_AUTHORITY_LABEL, type NoticeAuthority } from '@/lib/notices/model';

const EMPTY: NoticeFields = { authority: 'other', section: null, periodLabel: null, din: null, demandAmount: null, receivedOn: null, responseDueOn: null, hearingOn: null, summary: null };

const FIELD_LABEL: Array<{ key: keyof Omit<NoticeFields, 'authority' | 'summary'>; label: string; type?: 'date' }> = [
  { key: 'section', label: 'Section' },
  { key: 'periodLabel', label: 'Period or AY' },
  { key: 'din', label: 'DIN or reference' },
  { key: 'demandAmount', label: 'Demand (Rs.)' },
  { key: 'receivedOn', label: 'Notice date', type: 'date' },
  { key: 'responseDueOn', label: 'Reply due', type: 'date' },
  { key: 'hearingOn', label: 'Hearing', type: 'date' },
];

/**
 * The notice desk's intake (IDEAS-PLAN wave 2, section C): choose the client and the notice file,
 * the notice reader fills the fields, and the person checks or corrects them before "Open case",
 * which is the approval of `compliance.openNotice`. Fields the reader could not find in the
 * notice's own text are left empty for the person to fill.
 */
export function NoticeIntake({ open, onOpenChange, engagements, onOpened }: { open: boolean; onOpenChange: (open: boolean) => void; engagements: Array<{ id: string; name: string }>; onOpened: (summary: string) => void }) {
  const [engagementId, setEngagementId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [attachment, setAttachment] = useState<{ id: string; fileName: string } | null>(null);
  const [fields, setFields] = useState<NoticeFields>(EMPTY);
  const [review, setReview] = useState<NoticeReview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = useOpenNotice();

  const reset = () => {
    setFile(null);
    setAttachment(null);
    setFields(EMPTY);
    setReview(null);
    setNote(null);
    setError(null);
  };

  const read = async () => {
    if (!file || !engagementId) return;
    setReading(true);
    setError(null);
    try {
      const out = await readNoticeFile(engagementId, file);
      setAttachment({ id: out.attachmentId, fileName: out.fileName });
      setFields({ ...EMPTY, ...(out.fields ?? {}) });
      setReview(out.review ?? null);
      setNote(out.error ?? (out.usedModel ? 'Check each value against the notice. Anything the notice does not print is left empty.' : 'Ask VCFO is not available, so fill in the details from the notice.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The notice was not uploaded.');
    } finally {
      setReading(false);
    }
  };

  const set = (key: keyof NoticeFields, value: string) => setFields((f) => ({ ...f, [key]: value.trim() ? value : null }));

  const save = async () => {
    setError(null);
    const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== ''));
    try {
      const out = await submit.mutateAsync({ ...(body as Partial<NoticeFields>), authority: fields.authority, engagementId, ...(attachment ? { attachmentId: attachment.id } : {}), value: attachment?.fileName ?? 'Notice' });
      onOpened(out.summary);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The case was not opened.');
    }
  };

  const held = review?.checks.filter((c) => !c.ok && c.rule !== 'file') ?? [];

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      eyebrow="Notice desk"
      title="Read a notice"
      width={520}
      footer={
        attachment ? (
          <>
            <Button variant="ghost" size="sm" onClick={reset}>
              Start again
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={submit.isPending}>
              Open case
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void read()} disabled={!file || !engagementId || reading}>
            {reading ? 'Reading the notice…' : 'Read the notice'}
          </Button>
        )
      }
    >
      <PanelSection title="Client and file">
        <div className="grid gap-3">
          <FilterSelect
            aria-label="Client"
            size="md"
            options={[{ value: '', label: 'Choose the client' }, ...engagements.map((e) => ({ value: e.id, label: e.name }))]}
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            disabled={Boolean(attachment)}
          />
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            aria-label="Notice file"
            disabled={Boolean(attachment)}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-1.5 file:border-line-strong file:bg-surface-raised file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
          />
          <p className="text-[12.5px] text-ink-muted">PDF (scanned pages too), Word or text. The file is kept in the client&apos;s vault under Notices when you open the case.</p>
        </div>
      </PanelSection>
      {attachment ? (
        <PanelSection title="What the notice says">
          {note ? <p className="mb-3 text-[12.5px] text-ink-muted">{note}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid gap-1 text-[12.5px] text-ink-muted">
              Authority
              <FilterSelect
                aria-label="Authority"
                size="md"
                options={NOTICE_AUTHORITIES.map((a) => ({ value: a, label: NOTICE_AUTHORITY_LABEL[a] }))}
                value={fields.authority}
                onChange={(e) => setFields((f) => ({ ...f, authority: e.target.value as NoticeAuthority }))}
              />
            </div>
            {FIELD_LABEL.map((f) => (
              <label key={f.key} className="grid gap-1 text-[12.5px] text-ink-muted">
                {f.label}
                <Input type={f.type ?? 'text'} value={fields[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={f.key === 'din' ? 'font-mono' : undefined} />
              </label>
            ))}
            <label htmlFor="notice-summary" className="col-span-2 grid gap-1 text-[12.5px] text-ink-muted">
              Summary
              <Textarea id="notice-summary" rows={3} value={fields.summary ?? ''} onChange={(e) => set('summary', e.target.value)} />
            </label>
          </div>
          {held.length > 0 ? (
            <ul className="mt-3 grid gap-1 text-[13px] text-warning">
              {held.map((c) => (
                <li key={c.rule}>{c.message}</li>
              ))}
            </ul>
          ) : null}
        </PanelSection>
      ) : null}
      {error ? (
        <p role="alert" className="px-5 py-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </SidePanel>
  );
}
