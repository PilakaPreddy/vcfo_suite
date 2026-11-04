'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Lock, RotateCcw, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Timeline editor (prototype cards/TimelineEditor, tl-editor.js), typed-date form.
 *
 * One row per part of the timeline with a date input for the start and the end (one input for a
 * milestone such as the COI), and a bar under it that shows the part on the whole timeline
 * with its old place as a hairline ghost. Moving a part's end past the next part's start pushes
 * the later parts on and keeps their length (cascade). Finished parts are locked. Undo steps
 * back one change; Reset puts every date back.
 *
 *   mode="manager"  saves at once ("Save timeline"), for staff (POST /api/engagements/:id/timeline)
 *   mode="client"   asks for a short reason and sends a change request ("Send request")
 *
 * The parent owns the write: `onSave(parts, reason)` resolves when it is stored.
 */
export interface EditPhase {
  id: string;
  name: string;
  /** YYYY-MM-DD. */
  from: string;
  /** YYYY-MM-DD; the same as `from` for a milestone. */
  to: string;
  /** A finished part is locked. */
  done?: boolean;
  /** A single date (the COI). */
  milestone?: boolean;
}

const DAY = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (s: string) => {
  const d = new Date(ms(s));
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}` : s;
};

/** Apply one typed change and push later parts on so none starts before the one before ends. */
export function cascadeEdit(parts: EditPhase[], index: number, field: 'from' | 'to', value: string): EditPhase[] {
  const out = parts.map((p) => ({ ...p }));
  const p = out[index];
  if (!p || p.done || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return parts;
  if (p.milestone) {
    p.from = value;
    p.to = value;
  } else if (field === 'from') {
    const len = ms(p.to) - ms(p.from);
    p.from = value;
    if (ms(p.to) < ms(value)) p.to = iso(ms(value) + Math.max(0, len));
  } else {
    p.to = value < p.from ? p.from : value;
  }
  for (let j = index + 1; j < out.length; j += 1) {
    const prev = out[j - 1]!;
    const q = out[j]!;
    if (q.done || ms(q.from) >= ms(prev.to)) continue;
    const len = ms(q.to) - ms(q.from);
    q.from = prev.to;
    q.to = q.milestone ? q.from : iso(ms(q.from) + len);
  }
  return out;
}

function TimelineEditor({
  open,
  onOpenChange,
  phases,
  mode,
  onSave,
  title = 'Edit timeline',
  eyebrow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phases: EditPhase[];
  mode: 'manager' | 'client';
  onSave: (parts: EditPhase[], reason?: string) => Promise<void> | void;
  title?: string;
  eyebrow?: string;
}) {
  const [parts, setParts] = useState<EditPhase[]>(phases);
  const [hist, setHist] = useState<EditPhase[][]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (open) {
      setParts(phases);
      setHist([]);
      setReason('');
      setError(null);
    }
  }, [open, phases]);

  const axis = useMemo(() => {
    const all = [...phases, ...parts].flatMap((p) => [ms(p.from), ms(p.to)]).filter(Number.isFinite);
    const t0 = Math.min(...all);
    const t1 = Math.max(...all, t0 + DAY);
    return { t0, span: t1 - t0 + DAY };
  }, [phases, parts]);
  const pct = (t: number) => `${((t - axis.t0) / axis.span) * 100}%`;
  const width = (a: string, b: string) => `${Math.max(((ms(b) - ms(a) + DAY) / axis.span) * 100, 1.2)}%`;

  const changed = parts.some((p, i) => p.from !== phases[i]?.from || p.to !== phases[i]?.to);
  const edit = (i: number, field: 'from' | 'to', value: string) => {
    const next = cascadeEdit(parts, i, field, value);
    if (next === parts) return;
    setHist((h) => [...h, parts]);
    setParts(next);
  };
  const undo = () => {
    const prev = hist.at(-1);
    if (!prev) return;
    setHist((h) => h.slice(0, -1));
    setParts(prev);
  };
  const save = async () => {
    if (mode === 'client' && !reason.trim()) {
      setError('Add a short reason for the change.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parts, mode === 'client' ? reason.trim() : undefined);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the timeline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      eyebrow={eyebrow}
      size="lg"
      right={
        <span className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={undo} disabled={hist.length === 0 || busy}>
            <Undo2 size={14} strokeWidth={1.6} aria-hidden /> Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setHist((h) => [...h, parts]);
              setParts(phases);
            }}
            disabled={!changed || busy}
          >
            <RotateCcw size={14} strokeWidth={1.6} aria-hidden /> Reset
          </Button>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error ? <span className="mr-auto text-[12.5px] text-danger">{error}</span> : null}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!changed || busy}>
            {mode === 'manager' ? 'Save timeline' : 'Send request'}
          </Button>
        </div>
      }
    >
      <ol className="grid gap-4">
        {parts.map((p, i) => {
          const before = phases[i];
          const moved = before && (before.from !== p.from || before.to !== p.to);
          return (
            <li key={p.id} className="grid gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex min-w-[160px] flex-1 items-center gap-1.5 text-[13.5px] font-medium text-ink">
                  {p.done ? <Lock size={13} strokeWidth={1.6} className="text-ink-faint" aria-label="Finished, locked" /> : null}
                  {p.name}
                </span>
                <label htmlFor={`${uid}-${p.id}-from`} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                  {p.milestone ? 'Date' : 'Start'}
                  <Input
                    id={`${uid}-${p.id}-from`}
                    type="date"
                    value={p.from}
                    disabled={p.done || busy}
                    onChange={(e) => edit(i, 'from', e.target.value)}
                    className="h-[34px] w-[150px] font-mono text-[13px]"
                  />
                </label>
                {p.milestone ? null : (
                  <label htmlFor={`${uid}-${p.id}-to`} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    End
                    <Input
                      id={`${uid}-${p.id}-to`}
                      type="date"
                      value={p.to}
                      min={p.from}
                      disabled={p.done || busy}
                      onChange={(e) => edit(i, 'to', e.target.value)}
                      className="h-[34px] w-[150px] font-mono text-[13px]"
                    />
                  </label>
                )}
              </div>
              <div className="relative h-3 rounded-bar bg-surface-sunken" aria-hidden>
                {moved && before ? (
                  <i
                    className="absolute inset-y-0 rounded-bar border border-line-strong"
                    style={{ left: pct(ms(before.from)), width: width(before.from, before.to) }}
                  />
                ) : null}
                <i
                  className={cn('absolute inset-y-0 rounded-bar', p.done ? 'bg-positive-mid' : p.milestone ? 'bg-navy' : 'bg-brand')}
                  style={{ left: pct(ms(p.from)), width: width(p.from, p.to) }}
                />
              </div>
              {moved && before ? (
                <span className="text-[12px] text-ink-muted">
                  Was {shortDate(before.from)}
                  {before.milestone ? '' : ` – ${shortDate(before.to)}`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {mode === 'client' ? (
        <label htmlFor={`${uid}-reason`} className="mt-5 grid gap-1.5">
          <span className="text-[13px] text-ink">Reason</span>
          <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} disabled={busy} />
        </label>
      ) : null}
    </Modal>
  );
}

/** Save the parts from manager mode (POST /api/engagements/:id/timeline). Throws the server's words. */
async function saveTimelineParts(engagementId: string, parts: EditPhase[]): Promise<void> {
  const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/timeline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parts: parts.filter((p) => !p.done).map((p) => ({ id: p.id, from: p.from, to: p.to })) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not save the timeline');
  }
}
