'use client';

/**
 * The steps table (R-07, Stripe T1 clean rows; prototype PhaseScreen DataGrid and the
 * expanded timeline rows). Used by the landing timeline (a phase row opened) and the phase
 * page. Columns: the ST5 mark, the step, the owner, the status, the date, the portal and
 * proof. A row opens its step page.
 */
import { ExternalLink, Paperclip } from 'lucide-react';
import { Fragment } from 'react';
import type { PortalPhase, PortalStep } from '@/lib/client-portal/step-model';
import { internRegistrationHeadingForTitle } from '@/lib/intern/intern-overview-progress';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { getStepAttachmentRequirements } from '@/lib/checklist/checklist-step-attachments';
import type { OwnershipType } from '@/data/engagements';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { StepMark } from '@/components/ui/step-track';
import { usePortal } from '../../PortalProvider';
import type { ViewerDoc } from '../documents/DocViewer';
import { PH, PHL, PH_WAIT, dateCell, kd, ownKey, signedUrlFor, stepHrefOf, tipTxt } from './data';
import { portalFor } from './portals';
import { markState, markTone, stepChip, useGo } from './spectrum';

export interface StepFile {
  fieldId: string;
  label: string;
  path: string;
  fileName: string;
}

/** Uploaded files of a step (from the client-visible answers). */
export function stepFiles(s: PortalStep, ownershipType?: OwnershipType): StepFile[] {
  const responses = extractItemResponses(s.item, s.slice);
  return getStepAttachmentRequirements(s.item, responses, ownershipType)
    .filter((r) => r.uploaded && responses[r.fieldId])
    .map((r) => ({ fieldId: r.fieldId, label: r.label, path: responses[r.fieldId]!.trim(), fileName: r.fileName ?? r.label }));
}

function viewerDocsFor(s: PortalStep, files: StepFile[]): ViewerDoc[] {
  return files.map((f) => ({
    id: `${s.id}:${f.fieldId}`,
    name: f.fileName,
    url: () => signedUrlFor(f.path),
    meta: `Step ${s.n} · ${s.title}`,
  }));
}

/** The sticky cells keep the row's fill: white, grey on hover, blurple on the focus row. */
const STICKY_BG = '!bg-surface-raised group-hover/row:!bg-surface-sunken';

export function StepTable({
  phase,
  variant,
  cur,
  short,
  coi,
  ownershipType,
  openViewer,
}: {
  phase: PortalPhase;
  variant: 'landing' | 'phase';
  cur?: string;
  short: string;
  coi?: string;
  ownershipType?: OwnershipType;
  openViewer: (docs: ViewerDoc[], i?: number) => void;
}) {
  const { openChat, toast, go } = usePortal();
  const goTo = useGo();
  const p = phase.no;
  const landing = variant === 'landing';
  let g = '';

  const waitText = phase.state === 'up' && PH_WAIT[p - 1] ? PH_WAIT[p - 1] : '';
  const waitQ = landing ? `When does ${PHL[p - 1]} start?` : `When does Phase ${p} · ${PH[p - 1]} start?`;

  const portalCell = (x: PortalStep) => {
    const o = ownKey(x);
    const portal = o !== 'You' && x.n !== 2 ? portalFor(x.item) : null;
    const files = stepFiles(x, ownershipType);
    const done = kd(x) === 'done';
    if (!portal && !files.length) return <span className="text-ink-faint">-</span>;
    return (
      <span className="flex items-center gap-1.5">
        {portal ? (
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={`Open ${portal.form} on the official portal`}
            data-tt={`${portal.form} · official portal`}
            data-notip=""
            onClick={(e) => {
              e.stopPropagation();
              window.open(portal.url, '_blank', 'noopener,noreferrer');
              toast(`Opens ${portal.form} on the official portal in a new tab`);
            }}
          >
            <ExternalLink size={15} strokeWidth={1.6} aria-hidden />
          </Button>
        ) : null}
        {files.length ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${done ? 'Proof' : 'Attachments'} of step ${x.n} · ${x.title}`}
            onClick={(e) => {
              e.stopPropagation();
              openViewer(viewerDocsFor(x, files), 0);
            }}
          >
            <Paperclip size={14} strokeWidth={1.6} aria-hidden />
            {done ? 'Proof' : files.length}
          </Button>
        ) : portal && done ? (
          <span className="whitespace-nowrap text-[12.5px] text-ink-muted" data-tt="SBC uploads the proof">
            Proof pending
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className={cn('sttb min-w-0', !landing && 'pin')}>
      {waitText ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[13px] text-ink-muted md:px-5">
          <span className="min-w-0 flex-1">{waitText}</span>
          <button
            type="button"
            className="text-[13px] font-medium text-brand-text hover:underline"
            aria-label={landing ? `Ask VCFO when ${PHL[p - 1]} starts` : `Ask VCFO when Phase ${p} starts`}
            onClick={() => openChat(waitQ)}
          >
            Ask VCFO
          </button>
        </div>
      ) : null}
      {/* C-192: .sttb-x scrolls sideways only on narrow cards; on wide ones the head sticks to the page. */}
      <div className="sttb-x">
        <table className="grid-table min-w-[720px]">
          <thead>
            <tr>
              {/* C-193: the mark and the step name stay on the left while the table scrolls sideways. */}
              <th className="sticky left-0 z-[1] w-10 !bg-surface-raised" aria-label="State" />
              <th className="sticky left-10 z-[1] !bg-surface-raised">Step</th>
              <th className="w-[124px]">Owner</th>
              <th className="w-[124px]">Status</th>
              <th className="w-[128px]">Date</th>
              <th className="w-[110px]">Portal</th>
            </tr>
          </thead>
          <tbody>
            {phase.steps.map((x) => {
              const head = p === 4 ? internRegistrationHeadingForTitle(x.title) : '';
              const showHead = head && head !== g;
              if (head) g = head;
              const o = ownKey(x);
              const chip = stepChip(x);
              const dt = dateCell(x, coi);
              const late = x.late && kd(x) !== 'done';
              const href = stepHrefOf(x);
              return (
                <Fragment key={x.id}>
                  {showHead ? (
                    <tr>
                      <td colSpan={6} className="!h-9 bg-surface-sunken text-[11.5px] font-medium uppercase tracking-[.07em] !text-ink-muted">
                        {head}
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    id={`step-${x.n}`}
                    // C-185: the step the page is about; C-186: a late client step reads red.
                    className={cn('group/row cursor-pointer', cur === x.id && '[&>td]:!bg-brand-soft', late && o === 'You' && 'late [&_.step-name]:!text-danger')}
                    onClick={() => go(href)}
                  >
                    <td className={cn('sticky left-0 z-[1] text-center', STICKY_BG)}>
                      <span className="inline-grid" data-tt={tipTxt(x)}>
                        <StepMark state={markState(x)} tone={markTone(x)} size={20} label={chip.label} />
                      </span>
                    </td>
                    <td className={cn('sticky left-10 z-[1]', STICKY_BG)}>
                      <a href={href} onClick={(e) => { e.stopPropagation(); goTo(href)(e); }} className="flex min-w-[200px] items-baseline gap-2" aria-label={`Open step ${x.n} · ${x.title}`}>
                        <span className="flex-none font-mono text-[12px] font-normal text-ink-muted">Step {x.n}</span>
                        <span className="step-name truncate text-[14px] font-medium text-ink" title={x.title}>
                          {x.title}
                        </span>
                      </a>
                    </td>
                    <td>
                      <OwnerChip owner={o === 'You' ? 'client' : o === 'MCA' ? 'mca' : 'sbc'} label={o === 'You' ? short : undefined} />
                    </td>
                    <td>
                      <Chip tone={chip.tone} fixed>
                        {chip.label}
                      </Chip>
                    </td>
                    <td>
                      <span className={cn('whitespace-nowrap', late ? 'font-medium text-danger' : 'font-normal text-ink-muted')}>{dt}</span>
                    </td>
                    <td>{portalCell(x)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* C-191: the row count under the table (a phase has at most a few dozen steps, so one page). */}
      {landing ? null : (
        <div className="flex items-center border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-muted md:px-5">
          {phase.steps.length ? `1–${phase.steps.length} of ${phase.steps.length}` : 'None'}
        </div>
      )}
    </div>
  );
}
