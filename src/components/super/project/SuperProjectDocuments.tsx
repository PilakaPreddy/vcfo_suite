'use client';

import { DashSection } from '@/components/dash/DashSection';
import { DashDataTable, type DashColumn } from '@/components/dash/DashDataTable';
import { FileBadge } from '@/components/ui/file-badge';
import { Chip } from '@/components/ui/spectrum-chip';
import { plainDay } from '@/lib/date-format';
import type { SuperDocument, SuperEngagementDetail } from '@/lib/super/super-overview';

/**
 * Everything filed against this engagement. Read-only: no download links are
 * minted here, because a signed URL is a write-shaped action and this surface
 * does not take those (context §3). The firm project screen owns downloads.
 */
export function SuperProjectDocuments({ detail }: { detail: SuperEngagementDetail }) {
  const documents = detail.documents;
  const shared = documents.filter((doc) => doc.sharedWithClient).length;

  return (
    <DashSection
      title="Documents"
      meta={documents.length === 0 ? undefined : `${shared} of ${documents.length} shared`}
      href="/app/super/vault"
      hrefLabel="All documents"
      flush
    >
      <DashDataTable
        bare
        columns={COLUMNS}
        rows={documents}
        rowKey={(row) => row.id}
        mobile={(row) => <DocumentMobileRow document={row} />}
        empty="No documents yet"
      />
    </DashSection>
  );
}

const COLUMNS: DashColumn<SuperDocument>[] = [
  {
    key: 'file',
    header: 'File',
    width: 'minmax(0,1.6fr)',
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <FileBadge name={row.fileName} />
        <span className="block min-w-0 truncate font-medium text-ink">{row.fileName}</span>
      </span>
    ),
  },
  {
    key: 'category',
    header: 'Category',
    width: 'minmax(0,0.8fr)',
    render: (row) => (
      <span className="block min-w-0 truncate text-ink-muted">{row.category ?? '–'}</span>
    ),
  },
  {
    key: 'step',
    header: 'Step',
    width: 'minmax(0,0.7fr)',
    mono: true,
    render: (row) => <span className="text-ink-muted">{row.stepId ?? '–'}</span>,
  },
  {
    key: 'shared',
    header: 'Client',
    width: 'minmax(7rem,0.5fr)',
    render: (row) => (
      <Chip fixed tone={row.sharedWithClient ? 'ok' : 'idle'}>
        {row.sharedWithClient ? 'Shared' : 'Internal'}
      </Chip>
    ),
  },
  {
    key: 'created',
    header: 'Filed',
    width: 'minmax(4.5rem,0.5fr)',
    align: 'right',
    render: (row) => <span className="tabular-nums">{plainDay(row.createdAt)}</span>,
  },
];

function DocumentMobileRow({ document }: { document: SuperDocument }) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
        <FileBadge name={document.fileName} />
        <span className="min-w-0 truncate">{document.fileName}</span>
      </p>
      <p className="mt-1 min-w-0 truncate text-[12.5px] text-ink-muted">
        {[document.category, document.stepId, plainDay(document.createdAt)]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}
