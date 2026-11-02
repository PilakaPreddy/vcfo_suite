'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Lock, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { shortDate } from '@/lib/board-meetings/dates';
import { resolvedText } from '@/lib/board-meetings/rules';
import { useMeetingActions, type MeetingDto, type ResolutionBody } from '@/hooks/use-board-meetings';
import type { MeetingDocumentDto } from '@/lib/board-meetings/wire';
import { Banner, Card, Field } from './parts';
import { SigningLoop, SigningPanel } from './SigningCard';

/**
 * MOM TAB — VCFO does not write the minutes. The lead gets the MoM from outside the tool and
 * uploads it here (one button). Then: send to the directors to sign, upload the signed copy,
 * and the document locks and the final copy goes to the directors, the admin and the lead.
 */
export function MomTab({ meeting }: { meeting: MeetingDto }) {
  const actions = useMeetingActions(meeting.id);
  const ref = useRef<HTMLInputElement>(null);
  const mom = meeting.documents.find((d) => d.kind === 'mom') ?? null;
  const beforeMeeting = meeting.meetingDate > meeting.dates.today;
  const upload = (file: File | undefined) => {
    if (!file) return;
    actions.uploadMom.mutate(file, {
      onSuccess: () => toastSaved('MoM uploaded', { sub: 'Next: send it to the directors to sign' }),
      onError: (e) => toastError('Could not upload the MoM', errorMessage(e)),
    });
  };
  const overdue = meeting.status === 'held' && mom?.status !== 'locked' && meeting.dates.today > meeting.dates.momDue;

  return (
    <div className="grid grid-cols-1 gap-5">
      {overdue ? <Banner tone="bad">The signed MoM was due {shortDate(meeting.dates.momDue)} (30 days after the meeting).</Banner> : null}
      <Card
        title="Minutes of meeting"
        right={
          mom?.status !== 'locked' && meeting.can.uploadMom ? (
            <Button size="sm" variant={mom ? 'secondary' : 'default'} onClick={() => ref.current?.click()} disabled={actions.uploadMom.isPending}>
              <FileUp className="h-4 w-4" aria-hidden /> {actions.uploadMom.isPending ? 'Uploading…' : mom ? 'Replace MoM' : 'Upload MoM'}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4 px-5 py-4">
          <SigningLoop doc={mom} />
          {mom ? (
            <SigningPanel meeting={meeting} doc={mom} canAct={meeting.can.uploadMom} />
          ) : (
            <p className="m-0 text-[14px] text-ink-muted">
              {meeting.status === 'cancelled'
                ? 'The meeting was cancelled.'
                : beforeMeeting
                  ? `Upload opens after the meeting on ${shortDate(meeting.meetingDate)}. The signed MoM is due ${shortDate(meeting.dates.momDue)}.`
                  : `Upload the MoM as a PDF once you have it. It is due signed by ${shortDate(meeting.dates.momDue)}.`}
            </p>
          )}
          <input
            ref={ref}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </Card>
    </div>
  );
}

const blank = (m: MeetingDto): ResolutionBody => ({
  title: '',
  description: '',
  resolutionDate: m.dates.today,
  changesItem: null,
  reason: null,
  signerIds: m.directors.filter((d) => d.current).map((d) => d.id),
});

const bodyOf = (d: MeetingDocumentDto): ResolutionBody => ({
  title: d.title,
  description: d.description,
  resolutionDate: d.resolutionDate ?? '',
  changesItem: d.changesItem,
  reason: d.reason,
  signerIds: d.signerIds,
});

/**
 * RESOLUTIONS TAB — resolutions the lead adds after the meeting (the MoM holds the rest),
 * drafted in the "resolution by circulation" layout. The directors picked here approve and sign;
 * no manager step. Signed means locked. They are carried into the next notice under BM-007;
 * once the next notice is sent, new resolutions belong to the next meeting.
 */
export function ResolutionsTab({ meeting }: { meeting: MeetingDto }) {
  const actions = useMeetingActions(meeting.id);
  const docs = meeting.documents.filter((d) => d.kind === 'resolution');
  const [editing, setEditing] = useState<{ id: string | null; body: ResolutionBody } | null>(null);

  const save = () => {
    if (!editing) return;
    const body = { ...editing.body, title: editing.body.title.trim(), description: editing.body.description.trim() };
    const opts = {
      onSuccess: () => {
        setEditing(null);
        toastSaved(editing.id ? 'Resolution saved' : 'Resolution added', { sub: 'Download the draft or send it to the directors to sign' });
      },
      onError: (e: unknown) => toastError('Could not save the resolution', errorMessage(e)),
    };
    if (editing.id) actions.editResolution.mutate({ docId: editing.id, body }, opts);
    else actions.addResolution.mutate(body, opts);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      {meeting.lockedAt ? (
        <Banner tone="info">The next meeting&apos;s notice is sent. New resolutions go to the next meeting.</Banner>
      ) : meeting.status === 'held' || meeting.status === 'sent' ? (
        <Banner tone="info">Add only the resolutions passed after the meeting. They go into the next notice as sub-points of the circulation item.</Banner>
      ) : null}

      {editing ? (
        <ResolutionForm
          meeting={meeting}
          value={editing.body}
          onChange={(body) => setEditing({ ...editing, body })}
          onSave={save}
          onCancel={() => setEditing(null)}
          busy={actions.addResolution.isPending || actions.editResolution.isPending}
          isNew={!editing.id}
        />
      ) : null}

      <Card
        title={`Resolutions after the meeting${docs.length ? ` · ${docs.length}` : ''}`}
        right={
          meeting.can.addResolution && !editing ? (
            <Button size="sm" onClick={() => setEditing({ id: null, body: blank(meeting) })}>
              <Plus className="h-4 w-4" aria-hidden /> Add resolution
            </Button>
          ) : null
        }
      >
        {docs.length === 0 ? (
          <EmptyState className="m-5" title={meeting.can.addResolution ? 'No resolution added after this meeting.' : 'Resolutions open after the meeting.'} />
        ) : (
          <ul className="m-0 list-none p-0">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 border-t border-line-soft px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-[15px] font-medium">{d.title}</p>
                    <p className="m-0 mt-0.5 text-[13px] text-ink-muted">
                      {d.resolutionDate ? shortDate(d.resolutionDate) : ''}
                      {d.changesItem ? ` · changes ${d.changesItem}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.status === 'locked' ? (
                      <Chip tone="ok" fixed raw>
                        <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                        Signed
                      </Chip>
                    ) : d.status === 'sent' ? (
                      <Chip tone="teal" fixed raw>
                        With directors
                      </Chip>
                    ) : (
                      <Chip tone="idle" fixed raw>
                        Draft
                      </Chip>
                    )}
                    <Button size="sm" variant="secondary" asChild>
                      <a href={`/api/board-meetings/documents/${d.id}/draft`}>
                        <Download className="h-4 w-4" aria-hidden /> Word draft
                      </a>
                    </Button>
                    {d.status !== 'locked' && meeting.can.addResolution ? (
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ id: d.id, body: bodyOf(d) })}>
                        <Pencil className="h-4 w-4" aria-hidden /> Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="m-0 whitespace-pre-line text-[13.5px] text-ink-2">{resolvedText(d.description)}</p>
                <SigningLoop doc={d} />
                <SigningPanel meeting={meeting} doc={d} canAct={meeting.can.addResolution || d.status === 'sent'} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ResolutionForm({
  meeting,
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  isNew,
}: {
  meeting: MeetingDto;
  value: ResolutionBody;
  onChange: (b: ResolutionBody) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isNew: boolean;
}) {
  const set = (p: Partial<ResolutionBody>) => onChange({ ...value, ...p });
  const toggle = (id: string, on: boolean) => set({ signerIds: on ? [...value.signerIds, id] : value.signerIds.filter((x) => x !== id) });
  const ok = value.title.trim() && value.description.trim() && value.resolutionDate && value.signerIds.length > 0;
  return (
    <Card title={isNew ? 'New resolution by circulation' : 'Edit resolution'}>
      <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">
          <Input value={value.title} placeholder="Opening of a current account with HDFC Bank" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Date of resolution">
          <Input type="date" value={value.resolutionDate} onChange={(e) => set({ resolutionDate: e.target.value })} />
        </Field>
        <Field label="Changes an earlier item (optional)">
          <Input value={value.changesItem ?? ''} placeholder="e.g. Item 6 of the last meeting" onChange={(e) => set({ changesItem: e.target.value || null })} />
        </Field>
        <Field label="Resolution text (starts after “RESOLVED THAT”)" className="md:col-span-2">
          <Textarea rows={5} value={value.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Why it could not wait for the next meeting (optional)" className="md:col-span-2">
          <Input value={value.reason ?? ''} onChange={(e) => set({ reason: e.target.value || null })} />
        </Field>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 md:col-span-2">
          <legend className="mb-1.5 text-[12px] font-medium text-ink-muted">Directors who approve and sign</legend>
          {meeting.directors
            .filter((d) => d.current)
            .map((d) => (
              <label key={d.id} className="flex items-center gap-2.5 text-[14px]">
                <Checkbox checked={value.signerIds.includes(d.id)} onCheckedChange={(c) => toggle(d.id, c === true)} />
                <span className="font-medium">{d.name}</span>
                {d.din ? <span className="font-mono text-[12.5px] text-ink-muted">{d.din}</span> : null}
                {!d.email ? <span className="text-[12.5px] text-warning">No email</span> : null}
              </label>
            ))}
        </fieldset>
        <div className="flex gap-2 md:col-span-2">
          <Button size="sm" onClick={onSave} disabled={!ok || busy}>
            {isNew ? 'Add resolution' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
