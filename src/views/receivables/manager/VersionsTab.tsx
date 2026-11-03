'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Modal } from '@/components/ui/modal';
import { sheetDate } from '@/lib/receivables/dates';
import { sumInr } from '@/lib/receivables/summary';
import { useVersion, useVersions } from '@/hooks/use-receivables';
import { inr, stamp } from '../format';

/** The Versions tab: every Update, newest first. The newest is what the client page shows. */

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-1.5';

function VersionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useVersion(id);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={data ? `Version ${data.seq} · ${stamp(data.publishedAt)}` : 'Version'} sub={data?.note} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {isLoading || !data ? (
        <p className="text-ink-muted">Loading…</p>
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
                    <td className={`${TD} text-right font-mono text-[12px]`}>{inr(r.status === 'open' ? r.amountInr : r.paidAmount)}</td>
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
            Open total in this version <span className="ml-3 font-mono text-[15px] text-ink">₹{inr(sumInr(data.snapshot.filter((r) => r.status === 'open')))}</span>
          </p>
        </>
      )}
    </Modal>
  );
}

export function VersionsTab({ sheetId }: { sheetId: string }) {
  const { data, isLoading, error } = useVersions(sheetId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-md border border-line bg-surface-raised p-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">Versions</h2>
      <p className="mt-1 text-[13px] text-ink-muted">Each Update publishes a version. The client page always shows the newest one.</p>
      {isLoading ? <p className="mt-3 text-ink-muted">Loading…</p> : null}
      {error ? <p className="mt-3 text-danger">{error.message}</p> : null}
      {data && data.length === 0 ? <p className="mt-3 text-ink-muted">Nothing published yet.</p> : null}
      <ul className="mt-2">
        {data?.map((v, n) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft py-2.5 first:border-t-0">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-semibold">
                  Version {v.seq} · {stamp(v.publishedAt)}
                </b>
                {n === 0 ? (
                  <Chip raw tone="ok">
                    On the client page
                  </Chip>
                ) : null}
              </div>
              <div className="text-[12.5px] text-ink-muted">
                {v.note} · by {v.publishedByName}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setOpen(v.id)}>
              View
            </Button>
          </li>
        ))}
      </ul>
      {open ? <VersionDialog id={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
