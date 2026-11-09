'use client';

import { useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { inr } from './format';

/**
 * The grid cells. An input cell has a raised surface and a calculated cell does not, which is the
 * one signal of where to type. Arrow keys and Enter move between cells; Left and Right move only
 * when the caret is at the edge of the text. Pasting several values from Excel fills across.
 */

export const TH = 'whitespace-normal border-b border-r border-line bg-surface-sunken px-2 py-1.5 text-center text-[12px] font-semibold leading-tight text-ink-muted align-bottom';
export const TD = 'h-8 whitespace-nowrap border-b border-r border-line-soft px-2 text-right font-mono text-[12px] tabular-nums text-ink';
export const TD_NAME = 'h-8 whitespace-nowrap border-b border-r border-line-soft px-2 text-left text-[13px] text-ink';
export const STICKY = 'sticky left-0 z-[1] bg-surface';
const INPUT = 'h-8 w-full min-w-0 bg-surface-raised px-2 text-[13px] text-ink outline-none focus:bg-surface-raised focus:ring-2 focus:ring-inset focus:ring-brand disabled:bg-transparent disabled:text-ink';

export function gridKeys(e: KeyboardEvent<HTMLElement>) {
  const cell = (e.target as HTMLElement).closest('td');
  const row = cell?.parentElement as HTMLTableRowElement | null;
  if (!cell || !row) return;
  const input = e.target as HTMLInputElement;
  let dr = 0;
  let dc = 0;
  if (e.key === 'ArrowUp') dr = -1;
  else if (e.key === 'ArrowDown' || e.key === 'Enter') dr = 1;
  else if (e.key === 'ArrowLeft' && (input.tagName !== 'INPUT' || input.selectionStart === 0)) dc = -1;
  else if (e.key === 'ArrowRight' && (input.tagName !== 'INPUT' || input.selectionEnd === input.value?.length)) dc = 1;
  else return;
  if (input.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
  const rows = [...(row.closest('tbody')?.rows ?? [])];
  const at = rows.indexOf(row);
  const target = dr ? rows[at + dr]?.cells[cell.cellIndex] : row.cells[cell.cellIndex + dc];
  const next = target?.querySelector<HTMLElement>('input,select');
  if (next) {
    e.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

/** The values of a paste, or null when it is a single value and the browser should handle it. */
export function pastedGrid(e: ClipboardEvent<HTMLElement>): number[][] | null {
  const text = e.clipboardData.getData('text/plain').replace(/\r/g, '').replace(/\n$/, '');
  if (!/[\t\n]/.test(text)) return null;
  e.preventDefault();
  return text.split('\n').map((line) => line.split('\t').map((v) => parseFloat(v.replace(/[,₹\s]/g, '')) || 0));
}

/**
 * `nullable` keeps "not entered" apart from 0: an empty cell is null and a typed 0 shows as 0.
 * The Variance tab needs it, because 0 is a valid actual there and a blank is not.
 */
export function NumberCell({ value, onChange, disabled, label, percent, onPasteGrid, placeholder, className, nullable, invalid }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string; percent?: boolean; onPasteGrid?: (grid: number[][]) => void; placeholder?: string; className?: string; nullable?: boolean; invalid?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const empty = value == null || (!nullable && value === 0);
  const shown = draft ?? (empty ? '' : value === 0 ? '0' : percent ? String(value) : inr(value));
  return (
    <input
      className={cn(INPUT, 'text-right font-mono text-[12px] tabular-nums', invalid && 'ring-2 ring-inset ring-danger', className)}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      placeholder={placeholder}
      value={shown}
      onFocus={(e) => {
        setDraft(empty ? '' : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const raw = e.target.value.trim();
        const n = parseFloat(raw.replace(/,/g, ''));
        onChange(raw === '' ? (placeholder || nullable ? null : 0) : Number.isFinite(n) ? n : 0);
      }}
      onKeyDown={gridKeys}
      onPaste={(e) => {
        const grid = onPasteGrid ? pastedGrid(e) : null;
        if (grid) onPasteGrid?.(grid);
      }}
    />
  );
}

export function TextCell({ value, onChange, disabled, label, placeholder, invalid }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; placeholder?: string; invalid?: boolean }) {
  return <input className={cn(INPUT, invalid && 'ring-2 ring-inset ring-danger')} aria-invalid={invalid || undefined} aria-label={label} disabled={disabled} placeholder={placeholder} value={value ?? ''} title={value || undefined} onChange={(e) => onChange(e.target.value)} onKeyDown={gridKeys} />;
}

export function SelectCell({ value, onChange, disabled, label, options, blank = true }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; options: { value: string; label: string }[]; blank?: boolean }) {
  const known = options.some((o) => o.value === value);
  return (
    <select className={cn(INPUT, 'cursor-pointer disabled:cursor-default disabled:appearance-none', !known && value && 'text-danger')} aria-label={label} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={gridKeys}>
      {blank ? <option value="" /> : null}
      {!known && value ? <option value={value}>(not in the list)</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A labelled field for forms and side panels. */
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
      <span className="overflow-hidden rounded-md border border-line-strong [&_input]:bg-surface-raised [&_select]:bg-surface-raised">{children}</span>
      {help ? <span className="text-[12px] text-ink-muted">{help}</span> : null}
    </label>
  );
}

/** A plain card with a head, for one table or form. */
export function Block({ title, hint, right, footer, children }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface-raised">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          {hint ? <p className="text-[12px] text-ink-muted">{hint}</p> : null}
        </div>
        {right}
      </header>
      {children}
      {footer ? <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-2.5">{footer}</footer> : null}
    </section>
  );
}

export function GridScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">{children}</div>;
}

export const GRID = 'w-max min-w-full border-separate border-spacing-0';
