'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PersonAvatar } from '@/components/super/parts/super-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { formatSuperAgo } from '@/components/super/overview/super-overview-format';
import { superEngagementHref } from '@/lib/super/super-overview';
import { useEscalations, useResolveEscalation, type EscalationRow } from './use-escalations';

/**
 * Escalations (G-20): what managers and leads raised to the super admin or an admin. Open ones
 * first; Resolve asks for a note in place and closes the escalation. `engagementId` narrows the
 * panel to one client (the client record).
 */
export function EscalationsPanel({
  engagementId,
  canResolve,
  limit,
}: {
  engagementId?: string;
  canResolve: boolean;
  /** Rows shown; the rest stay behind the count. */
  limit?: number;
}) {
  const query = useEscalations({ status: engagementId ? 'all' : 'open', engagementId });
  const rows = query.data ?? [];
  const open = rows.filter((r) => r.status === 'open').length;
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <DashSection title="Escalations" meta={query.isPending ? undefined : `${open} open`} flush>
      {query.isPending ? (
        <div className="p-4">
          <SkeletonRows rows={2} />
        </div>
      ) : query.isError ? (
        <div className="p-4">
          <EmptyState title="Escalations could not load" />
        </div>
      ) : shown.length === 0 ? (
        <div className="p-4">
          <EmptyState title={engagementId ? 'Nothing escalated' : 'No open escalations'} />
        </div>
      ) : (
        <ul>
          {shown.map((row) => (
            <EscalationItem key={row.id} row={row} canResolve={canResolve} showClient={!engagementId} />
          ))}
        </ul>
      )}
    </DashSection>
  );
}

function EscalationItem({ row, canResolve, showClient }: { row: EscalationRow; canResolve: boolean; showClient: boolean }) {
  const resolve = useResolveEscalation();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    resolve.mutate({ id: row.id, note: note.trim() }, { onSuccess: () => setAsking(false) });
  };

  return (
    <li className="border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <PersonAvatar name={row.raisedByName ?? 'Someone'} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium leading-snug text-ink">
            {showClient ? (
              <Link href={superEngagementHref(row.engagementId)} className="hover:underline">
                {shortCompany(row.companyName)}
              </Link>
            ) : null}
            {showClient ? ' · ' : null}
            <span className="font-normal">{row.reason}</span>
          </span>
          <span className="block truncate text-[12.5px] text-ink-muted">
            {row.raisedByName ?? 'Someone'} to {row.assignedToName ?? 'the super admin'} · {formatSuperAgo(row.createdAt)}
          </span>
          {row.status === 'resolved' && row.resolutionNote ? (
            <span className="mt-1 block text-[12.5px] text-ink-2">
              {row.resolvedByName ?? 'Resolved'}: {row.resolutionNote}
            </span>
          ) : null}
        </span>
        {row.status === 'resolved' ? (
          <Chip fixed tone="ok">Resolved</Chip>
        ) : canResolve && !asking ? (
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            Resolve
          </Button>
        ) : (
          <Chip fixed tone="bad">Open</Chip>
        )}
      </div>
      {asking ? (
        <form role="alert" className="mt-2 flex flex-wrap items-center gap-2 pl-9" onSubmit={submit}>
          <Input
            aria-label="Resolution note"
            className="min-w-0 flex-1"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the note is the only thing this step asks for
            autoFocus
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!note.trim() || resolve.isPending}>
            {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Resolve
          </Button>
        </form>
      ) : null}
    </li>
  );
}
