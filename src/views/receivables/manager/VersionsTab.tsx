'use client';

import { useState } from 'react';
import { GitCompare, History } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Chip } from '@/components/ui/spectrum-chip';
import { sheetDate } from '@/lib/receivables/dates';
import { sumInr } from '@/lib/receivables/summary';
import { describeVersionChange, diffVersions } from '@/lib/receivables/version-diff';
import type { VersionMetaDto } from '@/lib/receivables/wire';
import { useVersion, useVersions } from '@/hooks/use-receivables';
import { inr, stamp } from '../format';

/**
 * The Versions tab: every Update, newest first, in a section card. The newest is what the client
 * partners see. View shows one version's rows; "Compare with previous" lists what that Update
 * changed against the version before it (src/lib/receivables/version-diff.ts).
 */

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-1.5';

function VersionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useVersion(id);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={data ? `Version ${data.seq} · ${stamp(data.publishedAt)}` : 'Version'}
      sub={data?.note}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {isLoading || !data ? (
        <SkeletonRows rows={5} />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={TH}>Invoice no.</th>
                  <th className={TH}>Partner</th>
                  <th className={TH}>Due date</th>
                  <th className={`${TH} text-right`}>Amount INR</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshot.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{r.clientName}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{r.invoiceNo}</td>
                    <td className={TD}>{r.partnerName ?? '—'}</td>
                    <td className={TD}>{sheetDate(r.dueDate)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{inr(r.status === 'open' ? r.amountInr : r.paidAmount)}</td>
                    <td className={TD}>
                      <Chip raw tone={r.status === 'open' ? 'idle' : 'ok'}>
                        {r.status === 'open' ? 'Open' : 'Received'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-ink-muted">
            Open total in this version <span className="ml-3 text-[15px] tabular-nums text-ink">₹{inr(sumInr(data.snapshot.filter((r) => r.status === 'open')))}</span>
          </p>
        </>
      )}
    </Modal>
  );
}

const KIND_TONE = { added: 'prog', changed: 'warn', removed: 'idle' } as const;
const KIND_WORD = { added: 'Added', changed: 'Changed', removed: 'Removed' } as const;

function CompareDialog({ version, previous, onClose }: { version: VersionMetaDto; previous: VersionMetaDto; onClose: () => void }) {
  const next = useVersion(version.id);
  const prev = useVersion(previous.id);
  const ready = next.data && prev.data;
  const changes = ready ? diffVersions(prev.data!.snapshot, next.data!.snapshot) : [];
  const openBefore = ready ? sumInr(prev.data!.snapshot.filter((r) => r.status === 'open')) : 0;
  const openAfter = ready ? sumInr(next.data!.snapshot.filter((r) => r.status === 'open')) : 0;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Compare with previous"
      title={`Version ${version.seq} against version ${previous.seq}`}
      sub={`${stamp(previous.publishedAt)} → ${stamp(version.publishedAt)}`}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {!ready ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="grid gap-3">
          <p className="text-[13px] text-ink-2">
            Open total ₹{inr(openBefore)} → <b className="font-medium text-ink">₹{inr(openAfter)}</b>
            <span className="ml-2 text-ink-muted">
              ({changes.length} invoice{changes.length === 1 ? '' : 's'} changed)
            </span>
          </p>
          {changes.length === 0 ? (
            <EmptyState title="Nothing on the client page changed between these two versions." />
          ) : (
            <ul className="rounded-md border border-line">
              {changes.map((c) => (
                <li key={`${c.invoiceId}-${c.kind}`} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-t border-line-soft px-3 py-2.5 text-[13px] first:border-t-0">
                  <Chip raw tone={KIND_TONE[c.kind]}>
                    {KIND_WORD[c.kind]}
                  </Chip>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.clientName}</span>
                    {c.invoiceNo ? <span className="ml-2 font-mono text-[12px] text-ink-muted">{c.invoiceNo}</span> : null}
                    <span className="block text-[12.5px] text-ink-muted">{describeVersionChange(c, (n) => `₹${inr(n)}`, sheetDate).join(' · ')}</span>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">₹{inr(c.amountInr)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function VersionsTab({ sheetId }: { sheetId: string }) {
  const { data, isLoading, error } = useVersions(sheetId);
  const [open, setOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  return (
    <DashSection
      title="Versions"
      headIcon={{ icon: History, tone: 'teal' }}
      meta={data?.length ? `${data.length} published · the newest is on the client page` : 'Each Update publishes a version'}
      flush
    >
      {isLoading ? (
        <div className="p-4">
          <SkeletonRows rows={3} />
        </div>
      ) : error ? (
        <p role="alert" className="px-5 py-4 text-[13px] text-danger">
          {error.message}
        </p>
      ) : !data?.length ? (
        <div className="p-4">
          <EmptyState title="Nothing published yet. Click Update on the Sheet tab to publish the first version." />
        </div>
      ) : (
        <ul>
          {data.map((v, n) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-medium">Version {v.seq}</b>
                  <span className="text-[13px] text-ink-muted">{stamp(v.publishedAt)}</span>
                  {n === 0 ? (
                    <Chip raw tone="ok">
                      On the client page
                    </Chip>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-muted">
                  {v.note ? `${v.note} · ` : ''}by {v.publishedByName || 'SBC'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {data[n + 1] ? (
                  <Button size="sm" variant="quiet" onClick={() => setCompare(n)}>
                    <GitCompare aria-hidden /> Compare with previous
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => setOpen(v.id)}>
                  View
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open ? <VersionDialog id={open} onClose={() => setOpen(null)} /> : null}
      {compare !== null && data?.[compare] && data[compare + 1] ? <CompareDialog version={data[compare]} previous={data[compare + 1]} onClose={() => setCompare(null)} /> : null}
    </DashSection>
  );
}
