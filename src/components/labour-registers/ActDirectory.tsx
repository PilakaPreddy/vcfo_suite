'use client';

import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LR_TONES, type LrTone, lr } from './theme';
import { LrCard, LrCardHead } from './primitives';

/**
 * The batch as the download it becomes: one folder per act, the files inside it named.
 *
 * It is shown as a directory because that is what arrives. The registers download as an
 * act-wise zip, and an inspection is conducted act by act — "show me the Minimum Wages
 * registers" — so the screen is laid out the way both the filing cabinet and the zip already
 * are. A flat table of thirty forms makes the person rebuild that grouping in their head.
 *
 * File names are printed in full, in mono, exactly as they appear inside the archive. That is
 * not decoration: a practitioner forwards these to an inspector or a client, and the name is
 * what identifies the form once it has left this screen.
 */

export interface DirectoryFile {
  /** The name inside the zip, in full. */
  name: string;
  /** XLSX, PDF, DOCX. Drives the badge colour. */
  format: string;
  /** Where the file downloads from. Without one the row is a name, not a link. */
  href?: string;
  /** The document row, where this file is one. Needed to attest it. */
  documentId?: string;
  /** draft | attested | superseded. Left out, nothing is claimed either way. */
  status?: string;
  /** Who signed the printout, and when, once it has been signed. */
  attestedOn?: string;
  signedByName?: string;
  /** The signed scan, where one came back. */
  signedHref?: string;
  /** True when this file is the one a signature goes on: the printout, not the workbook. */
  signable?: boolean;
}

export interface DirectoryFolder {
  /** The act, which is also the folder name. */
  act: string;
  tone?: LrTone;
  /**
   * The files in it. An empty list is legitimate before the period is closed — the folder is
   * known from the catalogue, its contents are not built yet.
   */
  files: DirectoryFile[];
  /** How many files the folder will hold, when they are not generated yet. */
  expected?: number;
}

const FORMAT_TONE: Record<string, LrTone> = { xlsx: 'ok', pdf: 'bad', docx: 'blue', zip: 'warn' };

function FileBadge({ format }: { format: string }) {
  const tone = LR_TONES[FORMAT_TONE[format.toLowerCase()] ?? 'neutral'];
  return (
    <span
      className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium [font-family:var(--lr-mono)]"
      style={{ background: tone.soft, color: tone.ink }}
    >
      {format.toUpperCase()}
    </span>
  );
}

export function ActDirectory({
  folders,
  label = 'The zip, folder by folder',
  size,
  onAttest,
  className,
}: {
  folders: DirectoryFolder[];
  label?: string;
  /** "2.4 MB". Left out, nothing is claimed about the size. */
  size?: string;
  /**
   * Offered on a printout that has not been signed yet, and only to somebody who may sign.
   * Left out, no row offers it — which is how a client sees this screen.
   */
  onAttest?: (file: DirectoryFile) => void;
  className?: string;
}) {
  return (
    <LrCard className={className}>
      <LrCardHead
        icon={Folder}
        tone="ok"
        label={label}
        right={size ? <span className={cn(lr.code, 'text-[12px] text-[var(--lr-muted)]')}>{size}</span> : undefined}
      />

      <div className="py-1.5">
        {folders.map((folder, i) => {
          const tone = LR_TONES[folder.tone ?? 'reg'];
          const count = folder.files.length || folder.expected || 0;
          return (
            <div key={folder.act} className={i > 0 ? 'border-t border-[var(--lr-raised)]' : undefined}>
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Folder
                  className="size-4 flex-none"
                  strokeWidth={1.8}
                  style={{ color: tone.ink }}
                  aria-hidden="true"
                />
                <span className={cn(lr.code, 'font-medium text-[var(--lr-ink)]')}>{folder.act}/</span>
                <span className="text-[12px] text-[var(--lr-muted)]">
                  {folder.files.length
                    ? `${count} ${count === 1 ? 'file' : 'files'}`
                    : `${count} ${count === 1 ? 'file' : 'files'} · not generated`}
                </span>
              </div>
              {folder.files.length ? (
                <ul className="m-0 flex list-none flex-col gap-1.5 pb-2 pl-[50px] pr-4">
                  {folder.files.map((file) => (
                    <li key={file.name} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <FileBadge format={file.format} />
                      {file.href ? (
                        <a
                          href={file.href}
                          className={cn(lr.code, 'min-w-0 break-all text-[var(--lr-primary)] hover:underline')}
                        >
                          {file.name}
                        </a>
                      ) : (
                        <span className={cn(lr.code, 'min-w-0 break-all text-[var(--lr-ink-2)]')}>{file.name}</span>
                      )}

                      {file.status === 'attested' ? (
                        <span
                          className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: LR_TONES.ok.soft, color: LR_TONES.ok.ink }}
                        >
                          Signed{file.signedByName ? ` by ${file.signedByName}` : ''}
                          {file.attestedOn ? ` · ${file.attestedOn}` : ''}
                        </span>
                      ) : null}
                      {file.status === 'superseded' ? (
                        <span
                          className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: LR_TONES.warn.soft, color: LR_TONES.warn.ink }}
                        >
                          Superseded
                        </span>
                      ) : null}

                      {file.signedHref ? (
                        <a href={file.signedHref} className="text-[12px] font-semibold text-[var(--lr-primary)] hover:underline">
                          The signed copy
                        </a>
                      ) : null}

                      {/* Offered on the printout alone. A signature goes on paper, and the
                          workbook is the working copy it was produced from. */}
                      {onAttest && file.signable && file.status !== 'attested' && file.documentId ? (
                        <button
                          type="button"
                          onClick={() => onAttest(file)}
                          className="text-[12px] font-semibold text-[var(--lr-primary)] hover:underline"
                        >
                          Record the signed copy
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </LrCard>
  );
}
