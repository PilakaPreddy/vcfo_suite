'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, Lock, RotateCcw } from 'lucide-react';

import { ProvenanceBar } from '@/components/labour-registers/ProvenanceBar';
import { ReadinessDialog } from '@/components/labour-registers/ReadinessDialog';
import type { ReadinessSummary } from '@/lib/labour-registers/readiness';
import { stateByCode } from '@/data/labour-registers/states';

/**
 * One batch: one client, one state, one period.
 *
 * The screen is ordered the way the work is. The provenance bar first, because the question
 * anyone opens this page with is "what happened to this month". Then the close, which is the
 * only thing that permits generation. Then the registers themselves.
 *
 * A client component, and it must be: it hands Lucide icons to other client components, and a
 * function cannot cross the server-to-client boundary. The route assembles the data and passes
 * plain values. `src/views/labour-registers/load-batch.ts` does that assembly.
 */

export interface BatchView {
  batchId: string;
  stateCode: string;
  period: { from: string; to: string };
  status: string;
  locked: boolean;
  provenance: {
    periodFrom: string;
    periodTo: string;
    status: string;
    markedReadyAt: string | null;
    markedReadyByName: string | null;
    generatedAt: string | null;
    registers: number;
    fromStorage: number;
    reopenCount: number;
    reopenReason: string;
  } | null;
  acts: number;
  formsByAct: Array<{ act: string; forms: Array<{ id: string; formNumber: string; title: string; rule: string }> }>;
  uploads: Partial<Record<'paysheet' | 'attendance' | 'overtime' | 'employees', { rowCount: number; fileName: string }>>;
  readiness: ReadinessSummary;
  sentence: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function periodLabel(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  return `${from} to ${to}`;
}

export function BatchPage({ view, shellBase }: { view: BatchView; shellBase: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const state = stateByCode(view.stateCode);
  const label = periodLabel(view.period.from, view.period.to);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${shellBase}/labour-registers`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand">
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
          Labour registers
        </Link>
        <span className="text-[13px] text-ink-faint">/</span>
        <h1 className="text-[20px] font-medium text-ink">
          {state?.name ?? view.stateCode} · {label}
        </h1>
        <div className="flex-grow" />
        {view.locked ? (
          <>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-[14px] font-medium text-ink"
            >
              <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden="true" />
              Reopen inputs
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-[14px] font-medium text-white"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)' }}
            >
              <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Download all
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-[14px] font-medium text-white disabled:opacity-40"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)' }}
          >
            <Lock className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Mark as ready
          </button>
        )}
      </div>

      <ProvenanceBar
        periodLabel={label}
        status={view.status}
        markedReadyAt={view.provenance?.markedReadyAt}
        markedReadyByName={view.provenance?.markedReadyByName}
        generatedAt={view.provenance?.generatedAt}
        registers={view.provenance?.registers}
        acts={view.acts}
        fromStorage={view.provenance?.fromStorage}
        reopenCount={view.provenance?.reopenCount ?? 0}
        reopenReason={view.provenance?.reopenReason}
      />

      {view.formsByAct.map(({ act, forms }) => (
        <section key={act} className="rounded-md border-2 border-line bg-surface">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <FileSpreadsheet className="size-4 flex-none text-ink-muted" strokeWidth={1.6} aria-hidden="true" />
            <h2 className="text-[15px] font-medium text-ink">{act}</h2>
            <span className="inline-flex h-6 items-center rounded-md bg-surface-raised px-2.5 text-[12px] font-medium text-ink-muted">
              {forms.length} {forms.length === 1 ? 'register' : 'registers'}
            </span>
            <div className="flex-grow" />
            {view.locked ? (
              <button type="button" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand">
                <Download className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                Download act registers
              </button>
            ) : null}
          </div>
          <ul className="grid list-none gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
            {forms.map((form) => (
              <li key={form.id} className="rounded-md border-[1.5px] border-line-strong px-3.5 py-3">
                <div className="text-[13px] font-medium leading-snug text-ink">
                  Form {form.formNumber} — {form.title}
                </div>
                <div className="mt-1 font-mono text-[12px] text-ink-faint">
                  {/* No record count until the generator reports one per document. A wage
                      register and a quarterly return do not hold the same number of rows, and
                      printing the paysheet's count against both would be a made-up figure. */}
                  {view.locked ? 'XLSX, PDF' : 'Not generated'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ReadinessDialog
        open={dialogOpen}
        summary={view.readiness}
        sentence={view.sentence}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
      />
    </div>
  );
}
