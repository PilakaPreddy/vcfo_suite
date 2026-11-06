'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { useSpiceAttachments } from '@/hooks/use-spice-attachments';
import {
  SPICE_ATTACHMENT_STATUS_LABEL,
  type SpiceAttachment,
  type SpiceAttachmentStatus,
} from '@/lib/spice-attachments/derive';

const TONE: Record<SpiceAttachmentStatus, ChipTone> = {
  done: 'ok',
  waiting: 'teal',
  'not-started': 'idle',
};

function StatusChip({ status }: { status: SpiceAttachmentStatus }) {
  return (
    <Chip tone={TONE[status]} fixed>
      {SPICE_ATTACHMENT_STATUS_LABEL[status]}
    </Chip>
  );
}

/**
 * SPICe+ attachments (spec T6 of the Board resolution (NOC) page): the documents SPICe+ Part B
 * needs, each with Not started, Waiting or Done from existing records. The accepted board
 * resolution links to its Vault copy. Staff engagement page only; `shellBase` is the shell root
 * (`/app/intern`, `/app/manager`, `/app/admin`, `/app/super`) for the Vault link.
 */
export function SpiceAttachmentsCard({
  engagementId,
  shellBase,
  className,
}: {
  engagementId: string;
  shellBase: string;
  className?: string;
}) {
  const query = useSpiceAttachments(engagementId);
  const list = query.data;

  const vaultHref = (row: SpiceAttachment) =>
    row.vaultDocumentId ? `${shellBase}/vault/view/${encodeURIComponent(row.vaultDocumentId)}` : null;

  const columns: EFilingColumn<SpiceAttachment>[] = [
    { key: 'label', header: 'Document', render: (row) => <span className="text-ink">{row.label}</span> },
    { key: 'step', header: 'From', width: '22%', render: (row) => <span className="text-ink-muted">{row.stepTitle}</span> },
    { key: 'detail', header: 'State', width: '18%', render: (row) => <span className="text-ink-muted">{row.detail}</span> },
    { key: 'status', header: 'Status', width: '134px', render: (row) => <StatusChip status={row.status} /> },
    {
      key: 'open',
      header: '',
      width: '100px',
      align: 'right',
      render: (row) => {
        const href = vaultHref(row);
        return href ? (
          <Link href={href} className="text-[13px] font-medium text-brand-text hover:underline">
            Open copy
          </Link>
        ) : null;
      },
    },
  ];

  return (
    <DashSection
      title="SPICe+ attachments"
      meta={list ? `${list.done} of ${list.total} done` : undefined}
      flush
      loading={query.isPending}
      className={className}
    >
      {query.isError ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">Could not load the attachments.</p>
      ) : (
        <EFilingGrid caption="SPICe+ attachments" columns={columns} rows={list?.items ?? []} rowKey={(row) => row.key} pageSize={20} empty="No attachments." />
      )}
    </DashSection>
  );
}
