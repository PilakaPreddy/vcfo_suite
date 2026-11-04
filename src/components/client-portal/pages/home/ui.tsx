'use client';

/**
 * Home primitives — the prototype's repeated markup as React: card header,
 * tabs (.seg), chips, hover tooltip parts (.tipw + .tt),
 * the duo-tone SVGs copied from the boards, and the upload / download helpers.
 */
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { InfoPopover } from '@/components/client-portal/shared';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { UploadTray, useMultiUpload } from '@/components/client-portal/use-multi-upload';
import { daysUntil, exactDate, relativeDue } from '@/lib/relative-due';
import { cn } from '@/lib/utils';
import { HOME_QUERY_KEY } from './useHome';
import type { DocItem } from './derive';
import { docUrl } from './derive';

;

/** Duo-tone board icon: [duo path, main path] exactly as the boards draw them. */
function Duo({ d, duo = '', size = 14, sw = 1.7, style }: { d: string; duo?: string; size?: number; sw?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      <path className="duo" d={duo} />
      <path d={d} />
    </svg>
  );
}

const IC = {
  download: { duo: 'M4.5 15h15v3.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5Z', d: 'M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15 M12 4.5V15 M7.8 10.8 12 15l4.2-4.2' },
  upload: { duo: 'M4.5 15h15v3.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5Z', d: 'M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15 M12 15V4.5 M7.8 8.7 12 4.5l4.2 4.2' },
  arrow: { duo: '', d: 'M5 12h14 M13 6l6 6-6 6' },
  link: { duo: '', d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  pencil: { duo: 'M14.5 5.5l4 4L9 19l-4.5 1 1-4.5Z', d: 'M15.5 4.5a2 2 0 0 1 2.9 0l1.1 1.1a2 2 0 0 1 0 2.9L9 19l-4.5 1 1-4.5Z M13.5 6.5l4 4' },
  octagon: { duo: 'M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3Z', d: 'M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3Z M12 8v4.6 M12 15.8v.1' },
  copy: { duo: 'M9 9h10v11H9Z', d: 'M10 8.5h9A1.5 1.5 0 0 1 20.5 10v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8.5 19v-9A1.5 1.5 0 0 1 10 8.5Z M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5' },
  eye: { duo: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z', d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z' },
  check: { duo: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15Z', d: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15Z M8.6 12.2l2.3 2.3 4.6-4.8' },
  chev: { duo: '', d: 'M9 6l6 6-6 6' },
  ext: { duo: '', d: 'M14 4.5h5.5V10 M19.5 4.5 11 13 M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10' },
  clip: { duo: '', d: 'M15.5 7.5 8.6 14.4a2 2 0 0 0 2.8 2.8l7.3-7.3a3.8 3.8 0 0 0-5.4-5.4L6 11.8a5.6 5.6 0 0 0 8 8l5.5-5.5' },
  file: { duo: 'M6 4.5h7.5L18 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z', d: 'M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z M13.5 3.5v5h5 M8.5 13h7 M8.5 16.5h4.5' },
  msg: { duo: 'M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5a1.5 1.5 0 0 1-1.5-1.5Z', d: 'M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5a1.5 1.5 0 0 1-1.5-1.5Z M8.5 9h7 M8.5 12h4.5' },
  info: { duo: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15Z', d: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15Z M12 11v5 M12 8v.1' },
  send: { duo: 'M4 12 20 4l-4 16-4-6Z', d: 'M4 12 20 4l-4 16-4-6Z M12 14l8-10' },
  undo: { duo: '', d: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11' },
} as const;

function Ico({ n, size = 14, sw = 1.7, style }: { n: keyof typeof IC; size?: number; sw?: number; style?: CSSProperties }) {
  return <Duo d={IC[n].d} duo={IC[n].duo} size={size} sw={sw} style={style} />;
}

/** Card header row (inline style verbatim from every v7c board). */
/* Card head (K-06, rules R-15 and R-16): 52px, a hairline under it, a 28px tile
   that comes from the title and a 14.5px/600 title. */
function CardHead({ title, info, askAbout, right }: { title: string; info?: ReactNode; askAbout?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 10, minHeight: 52, boxSizing: 'border-box', padding: '8px 16px', borderBottom: '1px solid var(--hair)' }}>
      <CardHeadTile title={title} />
      {/* Card heads never wrap: the title gives way before the tabs do. */}
      <h3 style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '600 14.5px var(--font-sans),sans-serif', color: 'var(--fg)' }}>{title}</h3>
      {info ? <InfoPopover askAbout={askAbout ?? title}>{info}</InfoPopover> : null}
      <div style={{ marginLeft: 'auto', display: 'flex', flex: 'none', gap: 6, alignItems: 'center' }}>{right}</div>
    </div>
  );
}

/** Tabs (`.seg`, K-09): small inline buttons; the picked tab is navy. No sliding pill. */
function Seg({
  tabs,
  value,
  onChange,
  full,
  wrap,
  label,
}: {
  tabs: { label: string; cnt?: number | string }[];
  value: number;
  onChange: (i: number) => void;
  full?: boolean;
  wrap?: boolean;
  label?: string;
}) {
  const n = tabs.length;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') onChange((value + 1) % n);
    else if (e.key === 'ArrowLeft') onChange((value - 1 + n) % n);
  };
  return (
    <div
      className={`seg${wrap ? ' vh-segwrap' : ''}`}
      role="tablist"
      aria-label={label}
      style={full ? { width: '100%' } : undefined}
    >
      {tabs.map((t, i) => (
        <button key={t.label} type="button" role="tab" aria-selected={i === value} tabIndex={i === value ? 0 : -1} className={i === value ? 'on' : ''} onClick={() => onChange(i)} onKeyDown={onKey}>
          {t.label}
          {t.cnt != null ? <span className="cnt">{t.cnt}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** `.tipw` hover/focus tooltip part that opens a drill on click / Enter. */
function Tip({
  tip,
  onOpen,
  style,
  className,
  children,
  variant = '',
  label,
}: {
  tip: string;
  onOpen?: () => void;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  variant?: string;
  label?: string;
}) {
  return (
    <span
      className={`tipw${className ? ` ${className}` : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label ?? tip}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.info,a,button')) return;
        onOpen?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
      style={{ position: 'relative', ...style }}
    >
      <span className={`tt ${variant}`} role="tooltip">
        {tip}
      </span>
      {children}
    </span>
  );
}

/* Owner chip (K-05, rule R-14): 96px soft chip with a dot. The client is amber,
   SBC is blue and the MCA is violet. */
function ownerChipStyle(owner: 'client' | 'sbc' | 'firm' | 'mca'): CSSProperties {
  const tone =
    owner === 'client'
      ? { background: 'var(--you-light)', color: 'var(--you-text)', '--dot': 'var(--due-mid)' }
      : owner === 'mca'
        ? { background: 'var(--violet-light)', color: 'var(--violet-text)', '--dot': 'var(--violet)' }
        : { background: 'var(--with-light)', color: 'var(--with-text)', '--dot': 'var(--with)' };
  return { ...tone, width: 96, minWidth: 96, justifyContent: 'center', overflow: 'hidden', textOverflow: 'ellipsis' } as CSSProperties;
}

/* ------------------------------------------------------------ due words */

/** `h.today` ("2026-10-29", India time) as a local calendar day for `relativeDue`. */
function dayOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/**
 * E-11: the relative due words that start the sub line of an attention list ("In 3 days",
 * "Today", "2 days late"), with the exact date ("Mon 19 Oct 2026") as a tooltip. Red when late,
 * amber within a week. Tables keep plain dates.
 */
export function DueWords({ iso, today, className }: { iso: string; today: string; className?: string }) {
  const now = dayOf(today);
  const words = relativeDue(iso, now);
  const n = daysUntil(iso, now);
  if (!words || n === null) return null;
  return (
    <span title={exactDate(iso)} className={cn(n < 0 ? 'text-danger' : n <= 7 ? 'text-warning' : undefined, className)}>
      {words}
    </span>
  );
}

/* ---------------------------------------------------------------- uploads */

/**
 * Upload against an open request (DECISIONS: uploads only against open
 * requests): opens the OS picker (or camera), posts the files, toasts
 * "Uploaded · <item>" with Undo. G-09: the picker takes several files; they go
 * in one request and the tray shows each file's own progress and, for a
 * refused file, its reason. Undo removes the whole batch.
 */
export function useNeedUpload({ tray = true }: { tray?: boolean } = {}) {
  const { toast } = usePortal();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement | null>(null);
  const pending = useRef<{ id: string; title: string } | null>(null);
  const up = useMultiUpload();
  const [trayTitle, setTrayTitle] = useState('');

  const send = useCallback(
    async (files: File[]) => {
      const target = pending.current;
      if (!target || !files.length) return;
      setTrayTitle(target.title);
      const url = `/api/client/home/needs/${encodeURIComponent(target.id)}/upload`;
      const res = await up.send(url, files);
      const docId = typeof res.body.documentId === 'string' ? res.body.documentId : null;
      if (!res.ok || !docId) {
        toast(res.body.error ?? 'Upload failed. Try again.');
        return;
      }
      void qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] });
      const refused = res.body.rejected?.length ?? 0;
      const stored = files.length - refused;
      const label = files.length === 1 ? `Uploaded · ${target.title}` : refused ? `Uploaded ${stored} of ${files.length} files · ${target.title}` : `Uploaded ${stored} files · ${target.title}`;
      // keep the tray open when a file was refused, so its reason stays on screen
      if (!refused) setTimeout(up.clear, 2400);
      toast(label, {
        undo: () => {
          up.clear();
          void fetch(`${url}?documentId=${encodeURIComponent(docId)}`, { method: 'DELETE' }).then(() => qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] }));
        },
      });
    },
    [qc, toast, up],
  );

  const pick = useCallback((id: string, title: string, capture?: boolean) => {
    pending.current = { id, title };
    const el = input.current;
    if (!el) return;
    if (capture) el.setAttribute('capture', 'environment');
    else el.removeAttribute('capture');
    el.value = '';
    el.click();
  }, []);

  /** Send files picked elsewhere (the upload dialog) against one request. */
  const sendTo = useCallback(
    (id: string, title: string, files: File[]) => {
      pending.current = { id, title };
      void send(files);
    },
    [send],
  );

  const field = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void send(files);
        }}
      />
      {tray ? <UploadTray title={trayTitle} rows={up.rows} busy={up.busy} onCancel={up.cancel} onClose={up.clear} /> : null}
    </>
  );
  // B-20: the per-file rows, so Home can show them in Recent documents instead of the tray.
  return { pick, sendTo, field, rows: up.rows, busy: up.busy, cancel: up.cancel, clear: up.clear, target: trayTitle };
}

/** ⬇ Download: resolve the signed URL, then save. */
export function useDownload() {
  const { toast } = usePortal();
  return useCallback(
    async (d: DocItem) => {
      try {
        const url = await docUrl(d);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(`Download started · ${d.name}`);
      } catch {
        toast('Could not download that file');
      }
    },
    [toast],
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
