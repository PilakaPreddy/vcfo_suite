'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/spectrum-chip';
import { PopoverCard } from '@/components/ui/popover';
import { buttonVariants } from '@/components/ui/button-variants';
import { FilterSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import { fetchHealthOverrideReview, useClientHealth, useSetHealthOverride, type ClientHealth, type HealthOverrideReview } from '@/hooks/use-client-health';
import { isAdminOrManager } from '@/lib/auth';
import { HEALTH_BAND_TONE, healthTitle } from '@/lib/client-health/display';
import { HEALTH_BAND_LABEL, HEALTH_BANDS, HEALTH_WEIGHTS, type HealthBand } from '@/lib/client-health/score';
import { cn } from '@/lib/utils';

/**
 * The computed client health band (IDEAS-PLAN wave 2, section E), shown beside the manual Health
 * field on the staff clients lists and in the client record head. Hovering shows the signals and
 * the points each took off; clicking opens the same lines, the weights and, for a manager or an
 * admin, "Set band by hand", which proposes the `statuses.setClientHealth` card: the person reads
 * the review and approves it. Nothing shows for a client, or before the nightly job has run.
 */

const WEIGHT_LINES = [
  `Open document request: 1 point a day after ${HEALTH_WEIGHTS.request.graceDays} days, at most ${HEALTH_WEIGHTS.request.cap}`,
  `No client reply or upload: 1 point a day after ${HEALTH_WEIGHTS.silence.graceDays} days, at most ${HEALTH_WEIGHTS.silence.cap}`,
  `Overdue compliance: ${HEALTH_WEIGHTS.overdue.each} each, at most ${HEALTH_WEIGHTS.overdue.cap}`,
  `Open notice: ${HEALTH_WEIGHTS.notices.each} each, at most ${HEALTH_WEIGHTS.notices.cap}`,
  `Stuck incorporation: up to ${HEALTH_WEIGHTS.stuck.cap}`,
  'Good 80+, Watch 60 to 79, At risk 40 to 59, Critical below 40',
];

export function ClientHealthChip({ engagementId, className }: { engagementId: string; className?: string }) {
  const { user } = useApp();
  const staff = Boolean(user && user.role !== 'client');
  const { item } = useClientHealth(engagementId, staff);
  if (!staff || !item) return null;
  return <ClientHealthChipView item={item} canOverride={isAdminOrManager(user?.role)} className={className} />;
}

/** The chip for a health record already in hand (the health board's rows). */
export function ClientHealthChipView({ item, canOverride, className }: { item: ClientHealth; canOverride: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const band = item.effectiveBand;
  return (
    <PopoverCard
      open={open}
      onOpenChange={setOpen}
      width={340}
      label={`Client health: ${HEALTH_BAND_LABEL[band]}`}
      title={`Client health: ${HEALTH_BAND_LABEL[band]}, ${item.score} of 100`}
      trigger={
        <button type="button" onClick={(e) => e.stopPropagation()} className={cn('inline-flex flex-none rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25', className)} title={healthTitle(item)} aria-label={`Computed client health ${HEALTH_BAND_LABEL[band]}, score ${item.score}`}>
          <Chip raw tone={HEALTH_BAND_TONE[band]} fixed>
            {item.override ? `${HEALTH_BAND_LABEL[band]}*` : HEALTH_BAND_LABEL[band]}
          </Chip>
        </button>
      }
    >
      {/* React events bubble out of the portal; a click here must not open the row under it. */}
      <div role="presentation" className="grid gap-3 px-4 py-3 text-[13px]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {item.override ? (
          <p className="text-ink-2">
            Set by hand{item.override.byName ? ` by ${item.override.byName}` : ''}
            {item.override.reason ? `: ${item.override.reason}` : ''}. The computed band is {HEALTH_BAND_LABEL[item.band]}.
          </p>
        ) : null}
        <ul className="grid gap-1">
          {item.signals.penalties.map((p) => (
            <li key={p.key} className={cn('flex items-baseline justify-between gap-3', !p.counted && 'text-ink-muted')}>
              <span>{p.detail}</span>
              <span className="flex-none tabular-nums text-ink-muted">{p.points > 0 ? `-${p.points}` : '0'}</span>
            </li>
          ))}
        </ul>
        <details className="text-[12.5px] text-ink-muted">
          <summary className="cursor-pointer">How the score is worked out</summary>
          <ul className="mt-1 grid gap-0.5">
            {WEIGHT_LINES.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
        <p className="text-[12px] text-ink-muted">Computed {new Date(item.computedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        {canOverride ? <OverrideForm item={item} onDone={() => setOpen(false)} /> : null}
      </div>
    </PopoverCard>
  );
}

function OverrideForm({ item, onDone }: { item: ClientHealth; onDone: () => void }) {
  const [band, setBand] = useState<HealthBand | 'clear'>(item.override?.band ?? item.band);
  const [reason, setReason] = useState(item.override?.reason ?? '');
  const [review, setReview] = useState<HealthOverrideReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = useSetHealthOverride();
  const body = { engagementId: item.engagementId, band, reason: reason.trim() || undefined };

  async function onReview() {
    setError(null);
    try {
      setReview(await fetchHealthOverrideReview(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The review could not be loaded.');
    }
  }

  async function onApprove() {
    setError(null);
    try {
      await apply.mutateAsync(body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The band was not saved.');
    }
  }

  return (
    <div className="grid gap-2 border-t border-line-soft pt-3">
      <p className="font-medium text-ink">Set band by hand</p>
      <FilterSelect
        value={band}
        onChange={(e) => {
          setBand(e.target.value as HealthBand | 'clear');
          setReview(null);
        }}
        aria-label="Health band"
        options={[
          ...HEALTH_BANDS.map((b) => ({ value: b, label: HEALTH_BAND_LABEL[b] })),
          ...(item.override ? [{ value: 'clear', label: 'Use the computed band' }] : []),
        ]}
      />
      {band !== 'clear' ? (
        <Textarea
          className="min-h-[60px] text-[13px]"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReview(null);
          }}
          placeholder="Why the band is set by hand"
          aria-label="Reason"
          maxLength={500}
        />
      ) : null}
      {review ? (
        <div className="grid gap-1 rounded-md bg-surface-sunken px-3 py-2 text-[12.5px]">
          <p>
            <span className="text-ink-muted">Now:</span> {review.displayOld || 'Computed band'}
          </p>
          <p>
            <span className="text-ink-muted">After:</span> {review.displayNew}
          </p>
          {review.heldReason ? <p className="text-danger">{review.heldReason}</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {review?.canApply ? (
          <button type="button" className={buttonVariants({ size: 'sm' })} onClick={() => void onApprove()} disabled={apply.isPending}>
            Approve
          </button>
        ) : (
          <button type="button" className={buttonVariants({ variant: 'secondary', size: 'sm' })} onClick={() => void onReview()}>
            Review
          </button>
        )}
      </div>
    </div>
  );
}
