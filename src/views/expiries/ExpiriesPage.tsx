'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { useAddExpiry, useExpiries, useMarkRenewed, type ExpiryItem } from '@/hooks/use-expiries';
import { daysLeftLabel, EXPIRY_KIND_LABEL, EXPIRY_KINDS, nextExpiryAfterRenewal, shortDate, type ExpiryBand, type ExpiryKind } from '@/lib/expiries/model';
import { cn } from '@/lib/utils';

type BandFilter = 'all' | ExpiryBand;

const BAND_CHIP: Record<ExpiryBand, ChipTone> = { red: 'bad', amber: 'warn', green: 'ok' };

/** The status word: renewed, expired, due soon (red or amber) or on track. */
function statusWord(item: ExpiryItem): string {
  if (item.renewedAt) return 'Renewed';
  if (item.daysLeft < 0) return 'Expired';
  if (item.band === 'green') return 'On track';
  return 'Due soon';
}

const SOURCE_LABEL: Record<ExpiryItem['source'], string> = {
  checklist: 'From the checklist',
  registration: 'From the registration',
  manual: 'Set by hand',
  ask: 'Set from Ask',
};

/**
 * EXPIRIES — the red, amber and green register of DSCs, DIR-3 KYC and registration renewals
 * across the staff member's clients (IDEAS-PLAN wave 2, section B). One page for every staff
 * role; `GET /api/expiries` is scoped by `AuthContext`, so each role sees its own clients.
 * Red is expired or 7 days or fewer away, amber is within 30 days. "Mark renewed" takes the new
 * expiry date when it is known; DIR-3 KYC and LEI roll on to their next cycle without one.
 */
const FIELD = 'h-control-sm rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px] text-ink';

/**
 * The hand-entry form: an FSSAI licence, a trade licence or any date the nightly backfill cannot
 * read. It posts to `POST /api/expiries`, which upserts on client, kind and name, so adding the
 * same item twice updates its date instead of making a second row.
 */
function AddExpiryForm({ onDone }: { onDone: () => void }) {
  const { engagements } = useApp();
  const add = useAddExpiry();
  const live = useMemo(() => [...engagements].sort((a, b) => a.companyName.localeCompare(b.companyName)), [engagements]);
  const [engagementId, setEngagementId] = useState('');
  const [kind, setKind] = useState<ExpiryKind>('fssai');
  const [subjectName, setSubjectName] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(engagementId && subjectName.trim() && expiresOn);

  const save = async () => {
    setError(null);
    try {
      await add.mutateAsync({ engagementId, kind, subjectName: subjectName.trim(), expiresOn, referenceLabel: referenceLabel.trim() || null });
      onDone();
    } catch {
      setError('The item was not saved. Check the details and try again.');
    }
  };

  return (
    <form
      className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void save();
      }}
    >
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
        Client
        <select className={FIELD} value={engagementId} onChange={(e) => setEngagementId(e.target.value)} required>
          <option value="">Choose a client</option>
          {live.map((e) => (
            <option key={e.id} value={e.id}>
              {e.companyName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
        Kind
        <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as ExpiryKind)}>
          {EXPIRY_KINDS.map((k) => (
            <option key={k} value={k}>
              {EXPIRY_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
        Holder
        <input className={FIELD} value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Director or company" maxLength={160} required />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
        Reference (optional)
        <input className={FIELD} value={referenceLabel} onChange={(e) => setReferenceLabel(e.target.value)} placeholder="Licence number" maxLength={160} />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
        Expires on
        <input className={FIELD} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
      </label>
      <Button size="sm" type="submit" disabled={!ready || add.isPending}>
        Add
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {error ? (
        <p role="alert" className="basis-full text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function ExpiriesPage({ basePath }: { basePath: string }) {
  const q = useExpiries();
  const renew = useMarkRenewed();
  const [band, setBand] = useState<BandFilter>('all');
  const [kind, setKind] = useState<'' | ExpiryKind>('');
  const [client, setClient] = useState('');
  const [renewing, setRenewing] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const items = useMemo(() => q.data ?? [], [q.data]);
  const clients = useMemo(() => [...new Map(items.map((i) => [i.engagementId, i.companyName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const kinds = useMemo(() => [...new Set(items.map((i) => i.kind))], [items]);
  const scoped = items.filter((i) => (!kind || i.kind === kind) && (!client || i.engagementId === client));
  const shown = scoped.filter((i) => band === 'all' || i.band === band);
  const count = (b: ExpiryBand) => scoped.filter((i) => i.band === b).length;
  const expired = items.filter((i) => !i.renewedAt && i.daysLeft < 0).length;

  const startRenew = (item: ExpiryItem) => {
    setError(null);
    setRenewing(item.id);
    setNewDate('');
  };
  const saveRenew = async (item: ExpiryItem) => {
    setError(null);
    try {
      await renew.mutateAsync({ id: item.id, newExpiresOn: newDate || null });
      setRenewing(null);
    } catch {
      setError('The item was not saved. Try again.');
    }
  };

  return (
    <PageTransition>
      <SEO title="Expiries — VCFO Suite" description="DSC, DIR-3 KYC and registration expiries across your clients." path={basePath} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <DashHero
          title="Expiries"
          subtitle="DSCs, DIR-3 KYC and registrations across your clients"
          stats={[
            { label: 'Expired', icon: AlertTriangle, value: expired, hot: expired > 0, onClick: () => setBand('red') },
            { label: 'Within 7 days or expired', icon: AlertTriangle, value: items.filter((i) => i.band === 'red').length, onClick: () => setBand('red') },
            { label: 'Within 30 days', icon: CalendarClock, value: items.filter((i) => i.band === 'amber').length, onClick: () => setBand('amber') },
            { label: 'Tracked', icon: ShieldCheck, value: items.length, onClick: () => setBand('all') },
          ]}
        />
        <DashSection
          title="Expiry register"
          meta={q.isLoading ? undefined : `${shown.length} of ${items.length}`}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {clients.length > 1 ? (
                <FilterSelect
                  aria-label="Client"
                  options={[{ value: '', label: 'All my clients' }, ...clients.map(([value, label]) => ({ value, label }))]}
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              ) : null}
              <FilterSelect
                aria-label="Kind"
                options={[{ value: '', label: 'Every kind' }, ...kinds.map((k) => ({ value: k, label: EXPIRY_KIND_LABEL[k] }))]}
                value={kind}
                onChange={(e) => setKind(e.target.value as '' | ExpiryKind)}
              />
              <SpectrumTabs
                label="Status"
                items={[
                  { key: 'all', label: 'All', count: scoped.length },
                  { key: 'red', label: 'Red', count: count('red') },
                  { key: 'amber', label: 'Amber', count: count('amber') },
                  { key: 'green', label: 'Green', count: count('green') },
                ]}
                value={band}
                onChange={(v) => setBand(v as BandFilter)}
              />
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
                <Plus className="h-4 w-4" aria-hidden /> Add item
              </Button>
            </span>
          }
        >
          {adding ? <AddExpiryForm onDone={() => setAdding(false)} /> : null}
          {q.isLoading ? (
            <SkeletonRows rows={5} />
          ) : q.isError ? (
            <EmptyState title="The register did not load." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
          ) : shown.length === 0 ? (
            <EmptyState title={items.length === 0 ? 'Nothing is tracked yet. DSC dates from the checklist and registration expiries appear here after the nightly run.' : 'No item matches these filters.'} />
          ) : (
            <div className="overflow-x-auto">
              {error ? (
                <p role="alert" className="mb-2 text-[13px] text-danger">
                  {error}
                </p>
              ) : null}
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12.5px] text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Who</th>
                    <th scope="col" className="py-2 pr-3 font-medium">What</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Expires</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => {
                    const rolls = nextExpiryAfterRenewal(item.kind, item.expiresOn);
                    return (
                      <tr key={item.id} className="border-b border-line align-top last:border-0">
                        <td className="py-2.5 pr-3">
                          <b className="block font-medium text-ink">{item.subjectName}</b>
                          <span className="block text-[12.5px] text-ink-muted">{item.companyName}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="block text-ink">{item.kindLabel}</span>
                          <span className="block text-[12.5px] text-ink-muted">{[item.referenceLabel, SOURCE_LABEL[item.source]].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3">
                          <span className="block font-mono text-[13px] text-ink">{shortDate(item.expiresOn)}</span>
                          <span className={cn('block text-[12.5px]', item.renewedAt ? 'text-ink-muted' : item.band === 'red' ? 'text-danger' : item.band === 'amber' ? 'text-warning' : 'text-ink-muted')}>
                            {item.renewedAt ? 'Renewal recorded' : daysLeftLabel(item.daysLeft)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Chip tone={BAND_CHIP[item.band]} raw fixed>
                            {statusWord(item)}
                          </Chip>
                        </td>
                        <td className="py-2.5 text-right">
                          {item.renewedAt ? null : renewing === item.id ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-2">
                              <label className="text-[12.5px] text-ink-muted" htmlFor={`renew-${item.id}`}>
                                {rolls ? `New expiry (blank: ${shortDate(rolls)})` : 'New expiry (optional)'}
                              </label>
                              <input
                                id={`renew-${item.id}`}
                                type="date"
                                value={newDate}
                                onChange={(e) => setNewDate(e.target.value)}
                                className="h-control-sm rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px] text-ink"
                              />
                              <Button size="sm" onClick={() => void saveRenew(item)} disabled={renew.isPending}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRenewing(null)}>
                                Cancel
                              </Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startRenew(item)}>
                              Mark renewed
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashSection>
      </div>
    </PageTransition>
  );
}
