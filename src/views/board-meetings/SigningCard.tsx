'use client';

import { useRef } from 'react';
import { BellRing, Download, Lock, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { FileBadge } from '@/components/ui/file-badge';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { useMeetingActions, type MeetingDto } from '@/hooks/use-board-meetings';
import type { MeetingDocumentDto } from '@/lib/board-meetings/wire';
import { stamp } from './view-model';

const SIGNER: Record<MeetingDocumentDto['signers'][number]['state'], { word: string; tone: ChipTone }> = {
  not_sent: { word: 'Not sent', tone: 'idle' },
  sent: { word: 'Sent', tone: 'teal' },
  opened: { word: 'Opened', tone: 'prog' },
  reminded: { word: 'Reminded', tone: 'warn' },
  signed: { word: 'Signed', tone: 'ok' },
};

/** The four steps of the signing loop, the same for the MoM and for a resolution. */
export function SigningLoop({ doc }: { doc: MeetingDocumentDto | null }) {
  const at = !doc ? 0 : doc.status === 'draft' ? 1 : doc.status === 'sent' ? 2 : doc.finalSentAt ? 4 : 3;
  const steps = ['Uploaded', 'Sent to directors', 'Signed copy back', 'Locked and shared'];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[13px]" aria-label="Signing steps">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-[4px] px-2 py-1 font-medium',
              i < at ? 'bg-positive-soft text-positive' : i === at ? 'bg-brand text-white' : 'border-1.5 border-line-strong text-ink-muted',
            )}
          >
            {i + 1}. {s}
          </span>
          {i < steps.length - 1 ? <span className="text-ink-faint">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * One document in the signing loop: the files, the directors who sign with their state and
 * log, and the next action (send, remind, upload the signed copy). Locked means read-only.
 */
export function SigningPanel({ meeting, doc, canAct }: { meeting: MeetingDto; doc: MeetingDocumentDto; canAct: boolean }) {
  const actions = useMeetingActions(meeting.id);
  const signedRef = useRef<HTMLInputElement>(null);
  const locked = doc.status === 'locked';

  const send = (reminder: boolean) =>
    actions.sendForSignature.mutate(
      { docId: doc.id, reminder },
      {
        onSuccess: () => toastSaved(reminder ? 'Reminder sent' : 'Sent to the directors to sign'),
        onError: (e) => toastError('Could not send', errorMessage(e)),
      },
    );
  const uploadSigned = (file: File | undefined) => {
    if (!file) return;
    actions.uploadSigned.mutate(
      { docId: doc.id, file },
      {
        onSuccess: () => toastSaved('Signed copy saved and locked', { sub: 'The final copy is emailed to the directors, admin and lead' }),
        onError: (e) => toastError('Could not upload', errorMessage(e)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {doc.hasFile ? (
          <a className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[13.5px] hover:bg-hover" href={`/api/board-meetings/documents/${doc.id}/file?which=file`}>
            <FileBadge name={doc.fileName ?? 'file.pdf'} />
            <span className="max-w-[220px] truncate">{doc.fileName ?? 'Unsigned copy'}</span>
            <Download className="h-4 w-4 text-ink-muted" aria-hidden />
          </a>
        ) : null}
        {doc.hasSigned ? (
          <a className="inline-flex items-center gap-2 rounded-md border border-positive/40 bg-positive-soft px-3 py-2 text-[13.5px] text-positive" href={`/api/board-meetings/documents/${doc.id}/file?which=signed`}>
            <Lock className="h-4 w-4" aria-hidden />
            <span className="max-w-[220px] truncate">{doc.signedName ?? 'Signed copy'}</span>
            <Download className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
      </div>

      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-ink-muted">
            <th className="py-1.5 pr-3 font-medium">Signs</th>
            <th className="py-1.5 pr-3 font-medium">State</th>
            <th className="py-1.5 font-medium">Log</th>
          </tr>
        </thead>
        <tbody>
          {doc.signers.map((s) => (
            <tr key={s.id} className="border-t border-line-soft align-top">
              <td className="py-2 pr-3">
                <span className="font-medium">{s.name}</span>
                {s.din ? <span className="ml-2 font-mono text-[12.5px] text-ink-muted">{s.din}</span> : null}
              </td>
              <td className="py-2 pr-3">
                <Chip tone={SIGNER[s.state].tone} fixed>
                  {SIGNER[s.state].word}
                </Chip>
              </td>
              <td className="py-2 text-[12.5px] text-ink-muted">
                {s.log.length ? s.log.map((l) => `${l.event} ${stamp(l.at)}`).join(' · ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {locked ? (
        <p className="m-0 flex items-center gap-2 text-[13px] text-ink-muted">
          <Lock className="h-4 w-4" aria-hidden /> Locked {stamp(doc.lockedAt)}. No edits.
          {doc.finalSentAt ? ` Final copy emailed ${stamp(doc.finalSentAt)}.` : ''}
        </p>
      ) : canAct ? (
        <div className="flex flex-wrap gap-2">
          {doc.status === 'draft' ? (
            <Button size="sm" onClick={() => send(false)} disabled={actions.sendForSignature.isPending || !doc.signers.length}>
              <Send className="h-4 w-4" aria-hidden /> Send to directors to sign
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => signedRef.current?.click()} disabled={actions.uploadSigned.isPending}>
                <Upload className="h-4 w-4" aria-hidden /> {actions.uploadSigned.isPending ? 'Uploading…' : 'Upload signed copy'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => send(true)} disabled={actions.sendForSignature.isPending}>
                <BellRing className="h-4 w-4" aria-hidden /> Remind
              </Button>
            </>
          )}
          <input
            ref={signedRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              uploadSigned(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
