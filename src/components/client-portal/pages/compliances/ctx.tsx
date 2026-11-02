'use client';

/**
 * Page-level actions shared by the calendar and filings pages: open a proof in
 * the shared DocViewer (rule 15), "Remind me" with Undo, "Add to my calendar"
 * (.ics), and the drill-down (rule 14).
 * A non-statutory task row (C-3, F-2) opens its task page from the drill-down, its deliverable
 * from the proof chip, and takes no reminder or .ics: those belong to statutory filings.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePortal } from '../../PortalProvider';
import { DocViewer, type ViewerDoc } from '../documents/DocViewer';
import { fetchProofs, useDownload, useReminder, viewerDocs } from './api';
import { CompDrill, type DrillState } from './CompDrill';
import { fmtDM, type PortalFiling } from '@/lib/client-portal/compliances';
import { isTaskRow } from './tasks';
import { attachmentUrl, taskHref } from './task-api';

interface CompCtxValue {
  today: string;
  companyShort: string;
  openProof: (f: PortalFiling, proofId?: string) => void;
  remind: (f: PortalFiling) => void;
  addToCalendar: (f: PortalFiling) => void;
  openDrill: (d: Omit<DrillState, 'n'>) => void;
}

const Ctx = createContext<CompCtxValue | null>(null);
export function useComp(): CompCtxValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useComp outside CompProvider');
  return v;
}

export function CompProvider({
  today,
  children,
  onDrillRow,
  drillLink,
}: {
  today: string;
  children: ReactNode;
  /** Drill-down row click (calendar → Filings side panel; filings → side panel). */
  onDrillRow: (f: PortalFiling) => void;
  /** Drill footer button: "Open filings" on the calendar, "Show in the list" on the Filings page. */
  drillLink: { text: string; onClick: () => void };
}) {
  const { toast, shell, go } = usePortal();
  const reminder = useReminder();
  const download = useDownload();
  const [viewer, setViewer] = useState<{ docs: ViewerDoc[]; index: number } | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);

  const openProof = useCallback(
    (f: PortalFiling, proofId?: string) => {
      if (isTaskRow(f)) {
        const d = f.task.deliverable;
        if (!d?.id) {
          go(taskHref(f.task.id, f.task.boardMeetingId));
          return;
        }
        attachmentUrl(f.task.id, d.id)
          .then((url) => window.open(url, '_blank', 'noopener'))
          .catch(() => toast('Could not open the file'));
        return;
      }
      fetchProofs(f.id)
        .then((proofs) => {
          if (!proofs.length) {
            toast('Proof pending · SBC will upload it');
            return;
          }
          const i = proofId ? Math.max(0, proofs.findIndex((p) => p.id === proofId)) : 0;
          setViewer({ docs: viewerDocs(f, proofs), index: i });
        })
        .catch(() => toast('Could not open the proof'));
    },
    [toast, go],
  );

  const remind = useCallback(
    (f: PortalFiling) => {
      if (isTaskRow(f)) {
        go(taskHref(f.task.id, f.task.boardMeetingId));
        return;
      }
      if (f.filedOn) {
        toast(`${f.name} is already filed`);
        return;
      }
      reminder.set.mutate(f.id, {
        onSuccess: (on) =>
          toast(`Remind me · done${on ? ` · email on ${fmtDM(on)}` : ''}`, {
            undo: () => reminder.clear.mutate(f.id),
          }),
        onError: (e) => toast(e instanceof Error ? e.message : 'Could not set the reminder'),
      });
    },
    [reminder.set, reminder.clear, toast, go],
  );

  const addToCalendar = useCallback(
    (f: PortalFiling) => {
      if (isTaskRow(f)) return;
      download(`/api/client/compliances/${f.id}/ics`);
      toast(`Download started · ${f.name} · ${f.period}.ics`);
    },
    [download, toast],
  );

  const openDrill = useCallback((d: Omit<DrillState, 'n'>) => setDrill((p) => ({ ...d, n: (p?.n ?? 0) + 1 })), []);

  const value = useMemo<CompCtxValue>(
    () => ({ today, companyShort: shell?.companyShort || 'Your company', openProof, remind, addToCalendar, openDrill }),
    [today, shell?.companyShort, openProof, remind, addToCalendar, openDrill],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {drill ? (
        <CompDrill
          key={drill.n}
          state={drill}
          today={today}
          link={drillLink}
          onClose={() => setDrill(null)}
          onRow={(f) => {
            setDrill(null);
            if (isTaskRow(f)) go(taskHref(f.task.id, f.task.boardMeetingId));
            else onDrillRow(f);
          }}
          onProof={openProof}
        />
      ) : null}
      {viewer ? (
        <DocViewer docs={viewer.docs} index={viewer.index} onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))} onClose={() => setViewer(null)} />
      ) : null}
    </Ctx.Provider>
  );
}
