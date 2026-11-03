'use client';

/**
 * Filing record (prototype comp-parts.tsx FilingBody): the Calendar opens it in a centred dialog
 * (EventDialog), Filings and the Obligation record in a side panel at the right edge (FilingPanel).
 * Both show the four workflow steps (ST5), the facts, SBC's draft date, the VCFO Assist state
 * with its steps and replay, and the proof files with Preview and Download. The side panel also takes the client's own proof files (G-03), Remind me
 * and "Open obligation". Phones: the dialog is a bottom sheet and the panel takes the full width.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Bell, CalendarPlus, Download, Eye, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortal } from '../../PortalProvider';
import { portalHref } from '../../routes';
import {
  AREA_LABEL,
  MON,
  MONTHS,
  daysBetween,
  fmtDM,
  fmtDMY,
  focusNodes,
  plural,
  portalFor,
  statusOf,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { AssistPanelBlock } from '@/components/compliances/AssistParts';
import { Button } from '@/components/ui/button';
import { Chip as SChip, type ChipTone } from '@/components/ui/spectrum-chip';
import { FileBadge } from '@/components/ui/file-badge';
import { toastSaved } from '@/components/ui/toast-saved';
import { proofHref, useAddProof, useProofs, type ProofMeta } from './api';
import { FocusTrack } from './bits';
import { useComp } from './ctx';
import { slugOf } from './obligations';
import { CpModal, CpSidePanel, KeyValue, PanelSection } from './overlay';
import { AreaTag, PortalLink, StatusChip } from './spectrum';

/** "Sep 2026" → "September 2026"; other period shapes unchanged. */
export function longPeriod(p: string): string {
  const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(p);
  if (!m) return p;
  const i = MON.indexOf(m[1]!);
  return i >= 0 ? `${MONTHS[i]} ${m[2]}` : p;
}

/** Filed early or late as a chip; an open period shows "Due 20 Oct" (red when overdue). */
function TimingChip({ f, today }: { f: PortalFiling; today: string }) {
  if (f.filedOn) {
    const early = daysBetween(f.filedOn, f.dueDate);
    if (early > 0) return <SChip tone="ok">{`${plural(early, 'day')} early`}</SChip>;
    if (early < 0) return <SChip tone="bad">{`${plural(-early, 'day')} late`}</SChip>;
    return null;
  }
  const late = daysBetween(today, f.dueDate) < 0;
  return <span className={cn('text-[12.5px]', late ? 'font-medium text-danger' : 'text-ink-muted')}>Due {fmtDM(f.dueDate)}</span>;
}

export function RiskChip({ r }: { r: string }) {
  const t = r.toLowerCase();
  const tone: ChipTone = t === 'high' ? 'bad' : t === 'medium' ? 'warn' : 'ok';
  return (
    <SChip tone={tone} dot={false}>
      {t ? t[0]!.toUpperCase() + t.slice(1) : '-'}
    </SChip>
  );
}

function inr(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function kb(n: number | null | undefined): string {
  if (n == null) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileExt(name: string, mime: string | null): string {
  const e = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toUpperCase();
  if (e) return e;
  if (mime?.includes('pdf')) return 'PDF';
  if (mime?.startsWith('image/')) return 'IMG';
  return 'FILE';
}

function FilingTitle({ f }: { f: PortalFiling }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {f.name} · {longPeriod(f.period)}
      <PortalLink f={f} />
    </span>
  );
}

function FilingChips({ f, today }: { f: PortalFiling; today: string }) {
  return (
    <>
      <AreaTag a={f.area} />
      <StatusChip s={statusOf(f, today)} />
      <TimingChip f={f} today={today} />
    </>
  );
}

/** One proof file row: the type badge, name, size and date, Preview and Download. */
function ProofRow({ f, p, first, onPreview }: { f: PortalFiling; p: ProofMeta; first?: boolean; onPreview: () => void }) {
  return (
    <li className={cn('flex items-center gap-3 border-t border-line-soft px-5 py-2.5 first:border-t-0', first && 'bg-surface-sunken')}>
      <FileBadge name={p.fileName} type={fileExt(p.fileName, p.mime) === 'PDF' ? 'PDF' : undefined} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{p.fileName}</span>
        <span className="block truncate text-[12px] text-ink-muted">
          {[p.byClient ? 'From you · SBC checks it' : null, kb(p.sizeBytes), fmtDM(p.uploadedAt.slice(0, 10))].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Button size="iconSm" variant="quiet" aria-label={`Preview ${p.fileName}`} title="Preview" onClick={onPreview}>
        <Eye size={16} strokeWidth={1.6} aria-hidden />
      </Button>
      <Button asChild size="iconSm" variant="quiet">
        <a href={proofHref(f.id, p.id)} download aria-label={`Download ${p.fileName}`} title="Download">
          <Download size={16} strokeWidth={1.6} aria-hidden />
        </a>
      </Button>
    </li>
  );
}

/** Steps, facts, SBC's draft date and the proof files of one filing. `upload` adds the client's own files. */
function FilingBody({ f, upload }: { f: PortalFiling; upload?: boolean }) {
  const { today, companyShort, openProof } = useComp();
  const { toast } = usePortal();
  const proofs = useProofs(f.id);
  const addProof = useAddProof();
  const fileRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);
  const s = statusOf(f, today);
  const lateBy = f.filedOn ? daysBetween(f.dueDate, f.filedOn) : 0;
  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setFailed([]);
    addProof.mutate(
      { filingId: f.id, files },
      {
        onSuccess: ({ done, failed: bad }) => {
          setFailed(bad);
          // M-28 (A1): an upload with no Undo shows the white toast with the green tick.
          if (done.length)
            toastSaved(done.length === 1 ? `${done[0]!.fileName} uploaded` : `${done.length} files uploaded`, {
              kind: 'uploaded',
              sub: done.length === 1 ? 'SBC checks it next.' : 'SBC checks them next.',
            });
          void proofs.refetch();
        },
        onError: () => toast('Upload failed. Try again.'),
      },
    );
  };
  const list = proofs.data ?? [];
  const facts: Array<{ k: string; v: ReactNode; mono?: boolean }> = [
    { k: 'Authority', v: f.authorityName || f.authority },
    { k: 'Frequency', v: f.freqLabel },
    { k: 'Period', v: f.periodLong ?? f.period },
    { k: 'Due', v: <span className={cn(s === 'over' && 'font-medium text-danger')}>{fmtDMY(f.dueDate)}</span> },
    { k: 'Filed on', v: f.filedOn ? <span className={cn(lateBy > 0 && 'text-danger')}>{fmtDMY(f.filedOn)}</span> : '-' },
    { k: 'Reference', v: f.acknowledgementNo ?? '-', mono: Boolean(f.acknowledgementNo) },
    { k: 'Filed by', v: f.filedOn ? (f.filedByName ? `${f.filedByName} · SBC` : 'SBC') : '-' },
    { k: 'Penalty risk', v: f.penaltyRisk ? <RiskChip r={f.penaltyRisk} /> : '-' },
    ...(f.amountPaid ? [{ k: 'Tax paid', v: inr(f.amountPaid) }] : []),
  ];
  return (
    <>
      <PanelSection>
        <FocusTrack nodes={focusNodes(f, companyShort, today)} />
      </PanelSection>
      <PanelSection>
        <KeyValue rows={facts} />
      </PanelSection>
      {f.draftDueOn && !f.approvedOn && !f.filedOn ? (
        <PanelSection>
          <p className="rounded-md bg-waiting-soft px-3 py-2.5 text-[13px] font-medium text-waiting">
            SBC will send the draft for {companyShort}’s approval by {fmtDM(f.draftDueOn)}.
          </p>
        </PanelSection>
      ) : null}
      {/* C-324, C-377: the VCFO Assist state of this filing (migration 0029). */}
      <div className="border-b border-line-soft">
        <AssistPanelBlock subjectKey={f.id} portal={portalFor(f)[0]} form={f.name} />
      </div>
      <PanelSection
        title="Proof"
        flush
        right={
          upload ? (
            <>
              <Button size="sm" variant="secondary" disabled={addProof.isPending} onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} strokeWidth={1.6} aria-hidden /> {addProof.isPending ? 'Uploading' : 'Add proof'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                aria-label={`Add proof for ${f.name} · ${f.period}`}
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          ) : undefined
        }
      >
        {failed.length ? (
          <div role="alert" className="grid gap-1 px-5 pb-2 text-[12.5px] text-danger">
            {failed.map((x) => (
              <span key={x.name}>
                {x.name} · {x.error}
              </span>
            ))}
          </div>
        ) : null}
        {proofs.isLoading ? (
          <div className="px-5 pb-4" aria-busy="true" aria-label="Loading the proof">
            <span className="block h-11 animate-pulse rounded-md bg-surface-sunken" />
          </div>
        ) : list.length ? (
          <ul>
            {list.map((p, i) => (
              <ProofRow key={p.id} f={f} p={p} first={i === 0} onPreview={() => openProof(f, p.id)} />
            ))}
          </ul>
        ) : f.filedOn ? (
          <div className="px-5 pb-4">
            <SChip tone="warn">Proof pending</SChip>
          </div>
        ) : (
          <p className="px-5 pb-4 text-[13px] text-ink-faint">None</p>
        )}
      </PanelSection>
    </>
  );
}

function AskLink({ f, onClose }: { f: PortalFiling; onClose: () => void }) {
  const { openChat } = usePortal();
  return (
    <button
      type="button"
      className="mr-auto text-[13px] font-medium text-brand-text hover:underline"
      onClick={() => {
        onClose();
        openChat(`Tell me about ${f.name} · ${f.period}`);
      }}
    >
      Ask VCFO
    </button>
  );
}

/* ---------------------------------------------------- calendar dialog */

export function DetailModal({ f, onClose, onOpenFilings }: { f: PortalFiling; onClose: () => void; onOpenFilings: (f: PortalFiling) => void }) {
  const { today, addToCalendar } = useComp();
  return (
    <CpModal
      size="lg"
      flush
      titleId="comp-det-t"
      onClose={onClose}
      eyebrow={`${f.authorityName || f.authority} · ${f.freqLabel}`}
      title={<FilingTitle f={f} />}
      sub={<FilingChips f={f} today={today} />}
      footer={
        <>
          <AskLink f={f} onClose={onClose} />
          {!f.filedOn ? (
            <Button variant="secondary" onClick={() => addToCalendar(f)}>
              <CalendarPlus size={16} strokeWidth={1.6} aria-hidden /> Add to my calendar
            </Button>
          ) : null}
          <Button onClick={() => onOpenFilings(f)}>Open in filings</Button>
        </>
      }
    >
      <FilingBody f={f} />
    </CpModal>
  );
}

/* ----------------------------------------------------- filings panel */

export function SidePanel({ f, onClose, hideObligation }: { f: PortalFiling; onClose: () => void; hideObligation?: boolean }) {
  const { today, remind, addToCalendar } = useComp();
  const { go } = usePortal();
  const obHref = `${portalHref('obligations')}/${encodeURIComponent(slugOf(f.particular))}?filing=${encodeURIComponent(f.id)}`;
  return (
    <CpSidePanel
      width={520}
      titleId="comp-pan-t"
      onClose={onClose}
      eyebrow={`${AREA_LABEL[f.area]} · ${f.freqLabel}`}
      title={<FilingTitle f={f} />}
      sub={<FilingChips f={f} today={today} />}
      footer={
        <>
          <AskLink f={f} onClose={onClose} />
          {!f.filedOn ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => addToCalendar(f)}>
                <CalendarPlus size={14} strokeWidth={1.6} aria-hidden /> Add to my calendar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => remind(f)} aria-pressed={Boolean(f.reminderOn)}>
                <Bell size={14} strokeWidth={1.6} aria-hidden /> {f.reminderOn ? `Reminder ${fmtDM(f.reminderOn)}` : 'Remind me'}
              </Button>
            </>
          ) : null}
          {!hideObligation ? (
            <Button
              size="sm"
              onClick={() => {
                onClose();
                go(obHref);
              }}
            >
              Open obligation
            </Button>
          ) : null}
        </>
      }
    >
      <FilingBody f={f} upload />
    </CpSidePanel>
  );
}
