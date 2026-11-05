'use client';

import { type CSSProperties, useId, useState } from 'react';
import { Download, Stamp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LR_TOKENS, lr } from './theme';

/**
 * Recording that a register has been signed.
 *
 * The firm attests a register with a wet signature on a printout: download the PDF, sign it,
 * seal it, scan it back. No DSC and no Aadhaar eSign — a decision taken in November 2026, and
 * this dialog is the whole of it on screen.
 *
 * Three things it insists on, each because of what an attestation is for:
 *
 *  - **The scan is required.** A row saying a register was signed, with nothing behind it, is
 *    the one thing an attestation must never be. The record exists so that somebody can be
 *    shown what was signed.
 *  - **The signatory is named.** The signature on the paper may be a manager's, a director's
 *    or a partner's, and whoever it is need not be a user of this product. The record should
 *    say whose name is under the line.
 *  - **It says it cannot be undone.** There is no route that un-attests, by design: a
 *    correction is issued as a new register that supersedes this one. Somebody about to press
 *    the button should know that before pressing it, not afterwards.
 */
export function AttestDialog({
  open,
  fileName,
  downloadHref,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** The register being signed, named as it is in the folder. */
  fileName: string;
  /** Where the printout downloads from, so the sign-it step is on this screen. */
  downloadHref?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (input: { file: File; signedByName: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const titleId = useId();
  const fileId = useId();
  const nameId = useId();

  if (!open) return null;

  const ready = Boolean(file) && signedByName.trim().length > 0;

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', lr.page)}
      style={{ ...LR_TOKENS, background: 'rgba(31, 39, 51, 0.42)' } as CSSProperties}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full max-w-[560px]', lr.card)}
        style={{ boxShadow: '0 32px 64px -16px rgba(31,39,51,0.32), 0 12px 24px -12px rgba(31,39,51,0.16)' }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <Stamp className="mt-1 size-5 flex-none text-[var(--lr-primary)]" strokeWidth={1.8} aria-hidden="true" />
          <h2 id={titleId} className={cn(lr.heading, 'm-0 min-w-0 flex-1')}>
            Record the signed register
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-7 flex-none items-center justify-center rounded-[var(--lr-radius-chip)] border border-[var(--lr-line-2)] text-[var(--lr-muted)]"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <p className={cn(lr.code, 'm-0 break-all px-6 text-[13px] text-[var(--lr-muted)]')}>{fileName}</p>

        <div className="mx-6 my-4 rounded-[var(--lr-radius-control)] border border-[var(--lr-line)] bg-[var(--lr-canvas)] p-4">
          <p className="m-0 text-[13px] leading-relaxed text-[var(--lr-muted)]">
            Print it, sign and seal it, and scan the signed page back here. From then on the scan is the
            attested register and the generated file is the draft it was made from. Both stay downloadable:
            an inspector asking what was signed should be given the thing that was signed.
          </p>

          {downloadHref ? (
            <a href={downloadHref} className={cn(lr.secondary, 'mt-3 text-[14px]')}>
              <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Download the printout
            </a>
          ) : null}

          <label htmlFor={nameId} className={cn(lr.headLabel, 'mb-1.5 mt-4 block')}>
            Who signed it
          </label>
          <input
            id={nameId}
            value={signedByName}
            onChange={(e) => setSignedByName(e.target.value)}
            placeholder="R. Venkatesh, Director"
            className={cn(lr.select, 'h-10 w-full')}
          />

          <label htmlFor={fileId} className={cn(lr.headLabel, 'mb-1.5 mt-3.5 block')}>
            The signed and sealed scan
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={cn(lr.small, 'block w-full')}
          />
        </div>

        <p className={cn(lr.small, 'm-0 px-6 pb-1')}>
          This cannot be undone. A correction is issued as a new register that supersedes this one, which is
          how a statutory record is kept.
        </p>

        {error ? (
          <p className="m-0 px-6 pt-2 text-[13px] text-[var(--lr-bad)]">{error}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--lr-raised)] px-6 py-4">
          <div className="flex-grow" />
          <button type="button" onClick={onCancel} className={cn(lr.quiet, 'text-[14px]')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => file && onConfirm({ file, signedByName: signedByName.trim() })}
            className={cn(lr.primary, 'text-[14px] font-medium')}
          >
            {busy ? 'Recording…' : 'Record it as signed'}
          </button>
        </div>
      </div>
    </div>
  );
}
