'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileCheck } from 'lucide-react';
import { ScheduleWindowControl, ScheduleWindowMeta } from '@/components/schedule/ScheduleWindowControl';
import { FilingProofEditor, FilingProofEditorDialog } from '@/components/compliances/FilingProofEditor';
import { FilingProofDialog, downloadAllProofs } from '@/components/compliances/FilingProofDialog';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { setFilingWindowInDb } from '@/lib/projects/engagements-db';
import { errorMessage, toastError } from '@/lib/toast-errors';
import type { FilingRow } from '@/lib/compliance/filings';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import { isIdentifier, plainDate } from '@/lib/compliance/spectrum-status';

/**
 * The register's two row actions, shared by Filings and the obligation
 * record: the manager's working window (a control for writers, quiet dates
 * for readers) and the proof cell. Writes go through the existing routes; the
 * repository re-checks the role.
 */

export function FilingWindowCell({ row, mayWrite }: { row: FilingRow; mayWrite: boolean }) {
  const queryClient = useQueryClient();
  const value = row.windowFrom && row.windowTo ? { from: row.windowFrom, to: row.windowTo } : null;
  if (!mayWrite) return <ScheduleWindowMeta value={value} />;
  return (
    <ScheduleWindowControl
      value={value}
      label={row.particular}
      onSave={async (window) => {
        await setFilingWindowInDb(row.id, window);
        await queryClient.invalidateQueries({ queryKey: ['filings'] });
      }}
    />
  );
}

/**
 * The proof cell (prototype Filings "Proof" column):
 *  - a filing with proof: a soft "Proof" button that opens the read dialog and a download button;
 *  - a filed filing without proof: an amber "Proof pending" chip (a writer's chip opens the editor);
 *  - otherwise a writer keeps the proof and details editor, a reader sees a dash.
 * The proof count is the side-table fact from `/api/client/compliances`, scoped by role.
 */
export function FilingProofCell({
  row,
  detail,
  mayWrite,
  now = new Date(),
}: {
  row: FilingRow;
  detail?: PortalFiling;
  mayWrite: boolean;
  now?: Date;
}) {
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const count = detail?.proofCount ?? 0;
  const title = [row.particular, row.periodLabel].filter(Boolean).join(' · ');
  const arn = detail?.acknowledgementNo?.trim() || '';

  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Button size="sm" variant="soft" className="h-[30px]" onClick={() => setReading(true)} aria-label={`Proof · ${title} · ${row.companyName}`}>
          <FileCheck aria-hidden />
          Proof
        </Button>
        <Button
          size="iconSm"
          variant="outline"
          className="h-[30px] w-[30px]"
          title="Download"
          aria-label={`Download proof of ${title}, ${row.companyName}`}
          onClick={() => {
            downloadAllProofs(row.id).catch((e: unknown) => toastError('Could not download the proof', errorMessage(e)));
          }}
        >
          <Download aria-hidden />
        </Button>
        <FilingProofDialog
          open={reading}
          onOpenChange={setReading}
          instanceId={row.id}
          title={title}
          eyebrow={row.companyName}
          facts={[
            { k: 'Filed on', v: plainDate(row.filedOn, now) },
            { k: 'Reference', v: arn || '—', mono: isIdentifier(arn) },
          ]}
          onEdit={
            mayWrite
              ? () => {
                  setReading(false);
                  setEditing(true);
                }
              : undefined
          }
        />
        {editing ? <FilingProofEditorDialog instanceId={row.id} label={row.particular} onClose={() => setEditing(false)} /> : null}
      </span>
    );
  }

  if (row.filedOn) {
    const chip = (
      <Chip tone="warn" fixed dot={false} raw>
        Proof pending
      </Chip>
    );
    if (!mayWrite) return chip;
    return (
      <>
        <button type="button" onClick={() => setEditing(true)} aria-label={`Add proof · ${title} · ${row.companyName}`} className="rounded-md">
          {chip}
        </button>
        {editing ? <FilingProofEditorDialog instanceId={row.id} label={row.particular} onClose={() => setEditing(false)} /> : null}
      </>
    );
  }

  if (mayWrite) return <FilingProofEditor instanceId={row.id} label={row.particular} />;
  return <span className="text-ink-faint">—</span>;
}
