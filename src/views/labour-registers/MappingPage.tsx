'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check, CheckCheck, Columns3, Sparkles } from 'lucide-react';

import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { LrBanner, LrCard, LrCardHead, LrChip, LrHero } from '@/components/labour-registers/primitives';
import { lr } from '@/components/labour-registers/theme';
import type { MatchBucket, MatchReason } from '@/lib/labour-registers/match';
import type { UploadSlot } from '@/lib/labour-registers/parse';

/**
 * COLUMN RECONCILIATION — what the client called it, and what the form calls it.
 *
 * The brief for this screen was "we should be able to select it automatically; nothing should
 * be manual", and the design follows from taking that literally.
 *
 * **Every row arrives decided.** A confident match and a plausible one are both pre-selected;
 * the only row that opens empty is one where the matcher found nothing at all, and that is the
 * single case where somebody genuinely has to look at the file. So the screen's normal state
 * is a list to glance at and a button to press, not a form to fill.
 *
 * The confident matches are collapsed, because a row nobody needs to touch should not be
 * taking up the space of one that does. Opening the card shows them with the reason each
 * landed — "exact heading", "known alias", "remembered from last filing" — so a reader can
 * check the working rather than having to trust it.
 *
 * **No percentage appears anywhere.** The matcher's own note says so: the scores are tuned
 * against a handful of filed workbooks and publishing them would imply a precision that is not
 * there. Three buckets, each with a reason.
 *
 * A heading can only fill one field. Choosing one that is already spoken for marks both rows
 * and disables saving, because a column silently feeding two registers is the kind of error
 * nobody finds until an inspector does.
 *
 * A client component: it hands Lucide icons to client components, and a function cannot cross
 * the server-to-client boundary.
 */

export interface MappingRow {
  field: string;
  label: string;
  required: boolean;
  bucket: MatchBucket;
  reason: MatchReason;
  /** The heading chosen. Pre-filled for everything but a `none`. */
  chosen: string;
  /** Up to three ranked options, best first. */
  candidates: string[];
}

export interface ValueRow {
  source: string;
  count: number;
  bucket: MatchBucket;
  chosen: string;
  candidates: string[];
}

export interface MappingView {
  batchId: string;
  slot: UploadSlot;
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: MappingRow[];
  values: ValueRow[];
  counts: { auto: number; suggested: number; none: number; required: number; optional: number; unresolvedValues: number };
  /** True when there is nothing left to ask. */
  complete: boolean;
  /** "Same columns as last month." — null on a first upload. */
  shapeNote: string | null;
  unchanged: boolean;
  locked: boolean;
}

const SLOT_LABEL: Record<UploadSlot, string> = {
  paysheet: 'Paysheet',
  attendance: 'Attendance',
  overtime: 'Overtime',
  employees: 'Employee details',
  leave: 'Leave',
};

/** The one place a bucket becomes a word. Never a number. */
function bucketWords(bucket: MatchBucket): { label: string; tone: 'ok' | 'info' | 'bad' } {
  if (bucket === 'auto') return { label: 'Matched', tone: 'ok' };
  if (bucket === 'suggested') return { label: 'Check', tone: 'info' };
  return { label: 'Not found', tone: 'bad' };
}

function Row({
  row,
  headers,
  clash,
  disabled,
  onChange,
}: {
  row: MappingRow;
  headers: string[];
  clash: boolean;
  disabled: boolean;
  onChange: (heading: string) => void;
}) {
  const words = bucketWords(row.bucket);
  /* The ranked candidates first, then everything else in the file: the order is the matcher's
     opinion, and a reader should not have to hunt past thirty headings for the likely one. */
  const options = [...row.candidates, ...headers.filter((h) => !row.candidates.includes(h))];

  return (
    <li
      className={`flex flex-wrap items-center gap-3 border-t border-[var(--lr-raised)] px-4 py-2.5 first:border-t-0 ${
        clash ? 'bg-[var(--lr-bad-soft)]' : ''
      }`}
    >
      <div className="min-w-[180px] flex-[999_1_200px]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--lr-ink)]">{row.label}</span>
          {row.required ? <LrChip tone="bad">Required</LrChip> : null}
        </div>
        <div className={`${lr.small} mt-0.5`}>
          {clash ? 'That column is already used by another field.' : row.reason}
        </div>
      </div>

      <select
        value={row.chosen}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Column for ${row.label}`}
        className={`${lr.select} min-w-[200px] flex-[0_1_280px]`}
      >
        <option value="">Not in this file</option>
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <LrChip tone={clash ? 'bad' : words.tone}>{clash ? 'Clash' : words.label}</LrChip>
    </li>
  );
}

export function MappingPage({ view, shellBase }: { view: MappingView; shellBase: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(view.rows);
  const [values, setValues] = useState(view.values);
  const [showMatched, setShowMatched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const batchHref = `${shellBase}/labour-registers?batch=${view.batchId}`;

  /* A heading may fill one field only. The clash set is derived on every render rather than
     tracked, so it cannot fall out of step with the choices. */
  const clashes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) if (row.chosen) seen.set(row.chosen, (seen.get(row.chosen) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([h]) => h));
  }, [rows]);

  const matched = rows.filter((r) => r.bucket === 'auto');
  const toCheck = rows.filter((r) => r.bucket === 'suggested');
  const notFound = rows.filter((r) => r.bucket === 'none');
  const missingRequired = rows.filter((r) => r.required && !r.chosen);
  const blocked = clashes.size > 0 || missingRequired.length > 0;

  function setChoice(field: string, heading: string) {
    setRows((current) => current.map((r) => (r.field === field ? { ...r, chosen: heading } : r)));
  }

  async function save() {
    if (blocked || saving || view.locked) return;
    setSaving(true);
    setError('');

    const mapping: Record<string, string> = {};
    for (const row of rows) if (row.chosen) mapping[row.field] = row.chosen;

    const valueMaps: Record<string, Record<string, string>> = {};
    for (const value of values) {
      if (value.chosen) (valueMaps.attendanceGrid ??= {})[value.source] = value.chosen;
    }

    try {
      const res = await fetch('/api/labour-registers/mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId: view.batchId, slot: view.slot, mapping, valueMaps }),
      });
      if (!res.ok) {
        const answer = (await res.json().catch(() => ({}))) as { error?: string };
        setError(answer.error ?? 'The mapping could not be saved.');
        return;
      }
      router.push(batchHref);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <LabourRegistersTheme className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={batchHref} className={lr.link}>
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
          Back to the batch
        </Link>
        <span className="text-[12px] text-[var(--lr-faint)]">/</span>
        <span className="text-[12px] font-semibold text-[var(--lr-ink)]">
          {SLOT_LABEL[view.slot]} columns
        </span>
      </div>

      <LrHero
        eyebrow={`${view.fileName}${view.sheetName ? ` · sheet "${view.sheetName}"` : ''}`}
        title={
          view.complete
            ? 'Every column matched itself'
            : missingRequired.length > 0
              ? `${missingRequired.length} required ${missingRequired.length === 1 ? 'column has' : 'columns have'} no match`
              : notFound.length > 0
                ? 'Nothing here is blocking'
                : 'Check these and save'
        }
        blurb={
          view.complete
            ? 'Nothing here needs you. The mapping is saved against this client, so next month will not ask again either.'
            : missingRequired.length > 0
              ? 'A required column with no match stops the period closing. Point it at a column, or upload a file that has one.'
              : notFound.length > 0
                ? `The matcher found no column for ${notFound.length} optional ${notFound.length === 1 ? 'field' : 'fields'}. Each prints nil on the form, which is prescribed and never removed — so this can be saved as it stands.`
                : 'The matcher has filled in everything it could. Change anything it got wrong, then save.'
        }
        stats={[
          { label: 'Matched', value: matched.length, tone: 'ok' },
          { label: 'To check', value: toCheck.length, tone: toCheck.length ? 'info' : 'neutral' },
          { label: 'Not found', value: notFound.length, tone: notFound.length ? 'bad' : 'neutral' },
          { label: 'In the file', value: view.headers.length },
        ]}
      />

      {view.shapeNote ? (
        <LrBanner icon={view.unchanged ? CheckCheck : AlertCircle} tone={view.unchanged ? 'ok' : 'warn'}>
          {view.shapeNote}
          {view.unchanged ? ' Last month’s mapping still holds, so there is nothing to do here.' : ''}
        </LrBanner>
      ) : null}

      {view.locked ? (
        <LrBanner icon={AlertCircle} tone="info">
          The period is closed, so the mapping is read-only. Reopen the inputs to change it.
        </LrBanner>
      ) : null}

      {/* The rows that need a decision come first. */}
      {notFound.length > 0 ? (
        <LrCard>
          <LrCardHead
            icon={AlertCircle}
            tone="bad"
            label={`No column found (${notFound.length})`}
            right={<LrChip tone="bad">{missingRequired.length} required</LrChip>}
          />
          <ul className="m-0 list-none p-0">
            {notFound.map((row) => (
              <Row
                key={row.field}
                row={row}
                headers={view.headers}
                clash={Boolean(row.chosen) && clashes.has(row.chosen)}
                disabled={view.locked}
                onChange={(h) => setChoice(row.field, h)}
              />
            ))}
          </ul>
          <p className={`${lr.small} border-t border-[var(--lr-raised)] px-4 py-2.5`}>
            A column that is genuinely not in this file can be left as it is. A required one blocks
            the close; an optional one prints nil on the form, which is prescribed and never removed.
          </p>
        </LrCard>
      ) : null}

      {toCheck.length > 0 ? (
        <LrCard>
          <LrCardHead
            icon={Sparkles}
            tone="info"
            label={`Worth a look (${toCheck.length})`}
            right={<LrChip tone="info">Already chosen</LrChip>}
          />
          <ul className="m-0 list-none p-0">
            {toCheck.map((row) => (
              <Row
                key={row.field}
                row={row}
                headers={view.headers}
                clash={Boolean(row.chosen) && clashes.has(row.chosen)}
                disabled={view.locked}
                onChange={(h) => setChoice(row.field, h)}
              />
            ))}
          </ul>
        </LrCard>
      ) : null}

      {/* The confident ones, collapsed. Nothing to do, so nothing taking up room. */}
      {matched.length > 0 ? (
        <LrCard>
          <LrCardHead
            icon={Check}
            tone="ok"
            label={`Matched automatically (${matched.length})`}
            right={
              <button type="button" onClick={() => setShowMatched((v) => !v)} className={lr.link}>
                {showMatched ? 'Hide' : 'Show the working'}
              </button>
            }
          />
          {showMatched ? (
            <ul className="m-0 list-none p-0">
              {matched.map((row) => (
                <Row
                  key={row.field}
                  row={row}
                  headers={view.headers}
                  clash={Boolean(row.chosen) && clashes.has(row.chosen)}
                  disabled={view.locked}
                  onChange={(h) => setChoice(row.field, h)}
                />
              ))}
            </ul>
          ) : (
            <p className={`${lr.small} px-4 py-3`}>
              {matched
                .slice(0, 6)
                .map((r) => r.label)
                .join(', ')}
              {matched.length > 6 ? ` and ${matched.length - 6} more` : ''}.
            </p>
          )}
        </LrCard>
      ) : null}

      {/* Attendance codes, where the file carries a day block. */}
      {values.length > 0 ? (
        <LrCard>
          <LrCardHead
            icon={Columns3}
            tone="blue"
            label={`Attendance codes (${values.length})`}
            right={
              view.counts.unresolvedValues > 0 ? (
                <LrChip tone="bad">{view.counts.unresolvedValues} unmatched</LrChip>
              ) : (
                <LrChip tone="ok">All matched</LrChip>
              )
            }
          />
          <ul className="m-0 list-none p-0">
            {values.map((value) => (
              <li
                key={value.source}
                className="flex flex-wrap items-center gap-3 border-t border-[var(--lr-raised)] px-4 py-2.5 first:border-t-0"
              >
                <div className="min-w-[160px] flex-[999_1_180px]">
                  <span className={`${lr.code} text-[13px] font-semibold text-[var(--lr-ink)]`}>
                    {value.source}
                  </span>
                  <div className={`${lr.small} mt-0.5`}>
                    {value.count} {value.count === 1 ? 'day' : 'days'} across the sheet
                  </div>
                </div>
                <select
                  value={value.chosen}
                  disabled={view.locked}
                  aria-label={`What ${value.source} means`}
                  onChange={(e) =>
                    setValues((current) =>
                      current.map((v) => (v.source === value.source ? { ...v, chosen: e.target.value } : v)),
                    )
                  }
                  className={`${lr.select} min-w-[180px] flex-[0_1_240px]`}
                >
                  <option value="">Leave as it is</option>
                  {value.candidates.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <LrChip tone={bucketWords(value.bucket).tone}>{bucketWords(value.bucket).label}</LrChip>
              </li>
            ))}
          </ul>
        </LrCard>
      ) : null}

      {/* The one action. */}
      {!view.locked ? (
        <LrCard className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-[999_1_320px]">
            {blocked ? (
              <p className="m-0 text-[13px] text-[var(--lr-bad)]">
                {clashes.size > 0
                  ? 'Two fields are taking the same column. A column can fill one field only.'
                  : `${missingRequired.length} required ${missingRequired.length === 1 ? 'column has' : 'columns have'} no match: ${missingRequired.map((r) => r.label).join(', ')}.`}
              </p>
            ) : (
              <p className={`${lr.small} m-0`}>
                Saved against this client, not this month. Next month&rsquo;s upload of the same shape
                will not ask again.
              </p>
            )}
            {error ? (
              <p className="m-0 mt-1 text-[13px] text-[var(--lr-bad)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Link href={batchHref} className={lr.quiet}>
            Cancel
          </Link>
          <button type="button" onClick={save} disabled={blocked || saving} className={lr.primary}>
            <Check className="size-4" strokeWidth={2} aria-hidden="true" />
            {saving ? 'Saving…' : 'Confirm all and save'}
          </button>
        </LrCard>
      ) : null}
    </LabourRegistersTheme>
  );
}
