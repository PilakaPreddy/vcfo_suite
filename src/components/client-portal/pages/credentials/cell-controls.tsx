import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { CRED_SRC_TIP, CRED_STATUS, type WireCell } from '@/lib/client-portal/credentials';
import { Ic } from './Ic';
import { fmtS } from './format';
import type { CredentialsState } from './use-credentials-state';

/** The board's status classes mapped to the shared Spectrum chip tones (R-13). */
const TONE: Record<string, ChipTone> = { ok: 'ok', due: 'warn', over: 'bad', up: 'idle' };

/** A shared status chip inside a Tailwind island (the portal resets Tailwind outside `.cp-tw`). */
function crChip(tone: ChipTone, text: string, fixed = false) {
  return (
    <span className="cp-tw cr-chipw">
      <Chip tone={tone} fixed={fixed}>
        {text}
      </Chip>
    </span>
  );
}

/** Copy button: the icon turns into a green tick for 1.5 s after a copy (prototype CopyButton). */
function CopyBtn({ label, onCopy }: { label: string; onCopy: () => void }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className={done ? 'cr-ib cr-s cr-copied' : 'cr-ib cr-s cr-ibp'}
      data-act="copy"
      aria-label={done ? 'Copied' : `Copy ${label}`}
      onClick={() => {
        onCopy();
        setDone(true);
        clearTimeout(t.current);
        t.current = setTimeout(() => setDone(false), 1500);
      }}
    >
      <Ic n={done ? 'check' : 'copy'} s={13} />
    </button>
  );
}

/** Small render helpers for cells and toolbars: grant chips, mode buttons, copy / hide / reveal, status and source chips. */
export function createCellControls(ctx: CredentialsState) {
  const {
    now,
    until,
    modeOf,
    label,
    openOtp,
    endScope,
    copyText,
  } = ctx;

  const sessChip = (scope: string) => {
    const m = modeOf(scope);
    if (!m) return null;
    return crChip(m === 'Edit' ? 'warn' : 'ok', `${m} · ${fmtS(until(scope) - now)}`);
  };
  const modeBtns = (scope: string, sm: string, ids: boolean) => {
    const m = modeOf(scope);
    return (
      <>
        {m ? sessChip(scope) : null}
        {m !== 'Preview' && m !== 'Edit' ? (
          <button type="button" className={`cr-btn${sm}`} data-act="preview" data-key={scope} onClick={() => openOtp('preview', scope, { act: 'preview', key: scope })}>
            <Ic n="eye" s={14} />
            {ids ? 'Preview all' : 'Preview'}
          </button>
        ) : null}
        {m !== 'Edit' ? (
          <button type="button" className={`cr-btn cr-btn-p${sm}`} data-act="editmode" data-key={scope} onClick={() => openOtp('edit', scope, { act: 'editmode', key: scope })}>
            <Ic n="pencil" s={14} />
            {ids ? 'Edit all' : 'Edit'}
          </button>
        ) : null}
        {m ? (
          <button type="button" className={`cr-btn${sm}`} data-act="lock" data-key={scope} onClick={() => void endScope(scope, { act: 'preview', key: scope })}>
            <Ic n="lock" s={14} />
            Lock
          </button>
        ) : null}
      </>
    );
  };

  const copyBtn = (key: string, v: string) => <CopyBtn key={`copy-${key}`} label={label(key)} onCopy={() => copyText(v, { quiet: true })} />;
  const hideBtn = (key: string) => (
    <button
      type="button"
      className="cr-ib cr-s"
      data-act="hide"
      data-key={key}
      aria-label={`Hide ${label(key)}`}
      onClick={() => void endScope(`cell:${key}`, { act: 'reveal-cell', key })}
    >
      <Ic n="eye-off" s={13} />
    </button>
  );
  const cellChip = (key: string) => crChip('ok', `Visible · ${fmtS(until(`cell:${key}`) - now)}`);
  const revealBtn = (key: string, icon: 'lock' | 'eye') => (
    <button
      type="button"
      className="cr-ib cr-s"
      data-act="reveal-cell"
      data-key={key}
      aria-label={`Reveal ${label(key)}`}
      onClick={() => openOtp('reveal', `cell:${key}`, { act: 'reveal-cell', key })}
    >
      <Ic n={icon} s={13} />
    </button>
  );

  const statusChip = (v: string) => {
    const s = CRED_STATUS.find((x) => x[0] === v);
    return s ? crChip(TONE[s[1]] ?? 'idle', v, s[1] !== 'up') : <span className="cr-dash">—</span>;
  };
  const plain = (v: string | null | undefined): ReactNode => {
    if (!v) return <span className="cr-dash">-</span>;
    if (v === 'Proof pending') return crChip('warn', 'Proof pending', true);
    if (v === 'Not registered yet' || v === 'Pending COI') return <span className="cr-pend">{v}</span>;
    return v;
  };
  const srcChip = (cell: WireCell | undefined) => {
    if (!cell?.src || !(cell.v || cell.has) || cell.v === 'Pending COI') return null;
    if (cell.edited)
      return (
        <span className="cr-src ed" title={`Changed by hand. It was filled from the ${cell.src}.`}>
          Edited
        </span>
      );
    return (
      <span className="cr-src" title={CRED_SRC_TIP[cell.src]} aria-label={`Auto from ${cell.src}. ${CRED_SRC_TIP[cell.src]}`}>
        Auto · from {cell.src}
      </span>
    );
  };

  return {
    sessChip,
    modeBtns,
    copyBtn,
    hideBtn,
    cellChip,
    revealBtn,
    statusChip,
    plain,
    srcChip,
  };
}

export type CellControls = ReturnType<typeof createCellControls>;
