'use client';

import Link from 'next/link';
import { BarChart3, ScrollText, TriangleAlert } from 'lucide-react';

import { IndiaMap, type MapState } from '@/components/labour-registers/IndiaMap';
import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { RegisterList, type RegisterRow } from '@/components/labour-registers/RegisterList';
import { LrCard, LrChip, LrHero } from '@/components/labour-registers/primitives';
import { lr } from '@/components/labour-registers/theme';
import { stateByCode, statesForPicker } from '@/data/labour-registers/states';
import { formsByAct, formsFor, monthPeriod } from '@/lib/labour-registers/catalogue';

/**
 * The client's own view of their labour registers.
 *
 * It is a different screen from the staff picker, not the same one with buttons removed, and
 * the reason is the question each answers. Staff ask "which state am I preparing next"; a
 * client asks "where do I employ people, and can I have September's file". So this screen
 * opens with the client's own establishments — the map lit only where they employ — and then
 * lists the registers for the selected one with a download beside each.
 *
 * Nothing here claims a register exists. Until the generator reports a document per form, each
 * row carries the status word for the period rather than a download link, because offering a
 * download that 404s is worse than saying it is not ready.
 *
 * A client component: it hands Lucide icons to client components, and a function cannot cross
 * the server-to-client boundary.
 */

export interface ClientRegistersPageProps {
  shellBase: string;
  stateCode?: string;
  /** `YYYY-MM`. */
  period?: string;
  /** The states this client has an establishment in. Empty means none is on record yet. */
  establishments?: string[];
  /** True once the period's registers have been generated and may be offered. */
  ready?: boolean;
  /** What is still awaited from the client, if anything. */
  awaiting?: { what: string; by: string };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parsePeriod(period: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 };
}

const ACT_ICONS = [ScrollText, BarChart3] as const;
const ACT_TONES = ['reg', 'ok', 'blue', 'warn', 'info', 'bad'] as const;

export function ClientRegistersPage({
  shellBase,
  stateCode,
  period,
  establishments,
  ready = false,
  awaiting,
}: ClientRegistersPageProps) {
  const all = statesForPicker();
  /* The client's own states, where they are known; otherwise every configured one, so the page
     is still usable before the establishment list is filled in. */
  const mine = (establishments?.length ? establishments : all.filter((s) => s.configured).map((s) => s.code)).filter(
    (code) => stateByCode(code)?.configured,
  );
  const selected = stateByCode(stateCode ?? '') ?? stateByCode(mine[0] ?? '') ?? all.find((s) => s.configured)!;
  const { year, month } = parsePeriod(period);
  const periodRange = monthPeriod(year, month);
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const forms = formsFor(selected.code, periodRange);
  const byAct = formsByAct(forms);
  const status = ready ? 'Done' : 'In progress';

  const href = (code: string) =>
    `${shellBase}/labour-registers?state=${code}&period=${year}-${String(month).padStart(2, '0')}`;

  const tiles: MapState[] = all.map((state) => ({
    code: state.code,
    configured: state.configured,
    relevant: mine.includes(state.code),
    count: state.configured ? formsFor(state.code, periodRange).length : undefined,
    status,
  }));

  return (
    <LabourRegistersTheme className="mx-auto flex w-full max-w-[1120px] flex-col gap-3">
      <LrHero
        eyebrow="Maintained for you by SBC"
        title="Your labour registers"
        blurb="Download what an inspector may ask for. Registers are prepared from the payroll data you send each month."
        stats={[
          { label: 'Establishments', value: mine.length },
          { label: `Registers for ${periodLabel}`, value: forms.length },
          { label: 'Status', value: status, tone: ready ? 'ok' : 'info' },
        ]}
      />

      {/* Where they employ people, as a map and as a list of the same rows. */}
      <LrCard className="flex flex-wrap items-start gap-5 px-5 py-4">
        <div className="min-w-[260px] flex-[0_0_320px]">
          <div className={`${lr.headLabel} mb-2`}>Where you employ people</div>
          <IndiaMap states={tiles} selected={selected.code} href={href} focusRelevant />
        </div>

        <div className="min-w-0 flex-[999_1_300px]">
          <div className={`${lr.headLabel} mb-2`}>Your establishments</div>
          <ul className="m-0 list-none overflow-hidden rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] p-0">
            {mine.map((code) => {
              const state = stateByCode(code)!;
              const isSelected = code === selected.code;
              const count = formsFor(code, periodRange).length;
              return (
                <li key={code} className="border-t border-[var(--lr-raised)] first:border-t-0">
                  <Link
                    href={href(code)}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2.5 ${isSelected ? 'bg-[var(--lr-primary-soft)]' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 flex-none rounded-[3px]"
                      style={{ background: isSelected ? 'var(--lr-primary)' : 'var(--lr-reg)' }}
                    />
                    <span className="min-w-0 flex-grow text-[13px] font-semibold text-[var(--lr-ink)]">
                      {state.name}
                    </span>
                    <span className="text-[12px] tabular-nums text-[var(--lr-muted)]">{count} registers</span>
                    <LrChip>{status}</LrChip>
                  </Link>
                </li>
              );
            })}
            {mine.length === 0 ? (
              <li className={`${lr.small} px-3 py-3`}>
                No establishment is on record yet. SBC adds these when the engagement is set up.
              </li>
            ) : null}
          </ul>
          <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-[var(--lr-muted)]">
            Only the states you employ in are lit. Click a state or a row to see its registers. The list holds the
            same rows as the map, so a keyboard or a screen reader reaches everything the map does.
          </p>
        </div>
      </LrCard>

      {/* The registers for the selected establishment, act by act. */}
      <div className="grid auto-rows-min items-start gap-3 lg:grid-cols-2">
        {byAct.map(({ act, forms: actForms }, i) => {
          const registers: RegisterRow[] = actForms.map((form) => ({
            id: form.id,
            name: `Form ${form.formNumber} — ${form.title}`,
            note: ready ? `${form.period} · ${form.rule}` : `${form.period} · SBC is preparing it`,
            /* A download is offered only once the period's registers exist. */
            href: ready ? `${shellBase}/labour-registers?state=${selected.code}&form=${form.id}` : undefined,
            status,
          }));
          return (
            <RegisterList
              key={act}
              act={act}
              icon={ACT_ICONS[i % ACT_ICONS.length]}
              tone={ACT_TONES[i % ACT_TONES.length]}
              status={status}
              registers={registers}
            />
          );
        })}
      </div>

      {awaiting ? (
        <LrCard tone="warn" className="flex flex-wrap items-center gap-3 px-4 py-3.5 text-[var(--lr-warn)]">
          <TriangleAlert className="size-[18px] flex-none" strokeWidth={1.9} aria-hidden="true" />
          <div className="min-w-0 flex-[999_1_340px]">
            <div className="text-[13px] font-medium">{awaiting.what} is pending with you</div>
            <div className="mt-0.5 text-[12px]">Send it by {awaiting.by} so the registers can be prepared on time.</div>
          </div>
          <Link href={`${shellBase}/documents`} className={lr.primary}>
            Upload it
          </Link>
        </LrCard>
      ) : null}

      <p className={`${lr.small} m-0`}>
        You can download and upload. Column mapping, generation and rebuilds stay with the SBC team.
      </p>
    </LabourRegistersTheme>
  );
}
