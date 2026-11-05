'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastUndo } from '@/components/ui/undo-toast';
import { cn } from '@/lib/utils';
import { setFilingWindowInDb } from '@/lib/projects/engagements-db';
import { toastError, errorMessage } from '@/lib/toast-errors';
import { filingStatus, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import { areaLabel, STATUS_FILL, worstStatus } from '@/lib/compliance/spectrum-status';

/**
 * TIMELINE VIEW of the staff calendar (prototype `FilingWindows`): one lane
 * per filing name, grouped by area, with one working-window bar per due date
 * on a zoomable strip of the financial year.
 *
 * A bar is the manager-set window of that filing (`compliance_instances`
 * `window_from` / `window_to`), or the default preparation days before the
 * due date when none is set. When several clients share one filing and one
 * due date, the bar stands for all of them and a move writes every unfiled
 * one. Writes go through the existing `POST /api/filings/:id/window` route,
 * so the role rule stays on the server: managers, admins and super admins
 * move bars; a project lead reads them. A filed bar is locked. Each move
 * gives an Undo toast that puts every window back as it was.
 *
 * Drag a bar to move it, drag an edge to resize it, ← → move a focused bar
 * and Shift + ← → resize it. A click without a drag, or Enter, opens the
 * filing. The orange line is today; the small mark on each bar is the due date.
 */

const DAY = 86_400_000;
const ZMAX = 40;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Default preparation days before the due date, the same as the client portal timeline. */
const PREP: Record<string, number> = { monthly: 5, quarterly: 10, 'half-yearly': 10, annual: 21 };

type Win = { s: number; e: number };
type Prev = { id: string; window: { from: string; to: string } | null };

interface WindowItem {
  id: string;
  title: string;
  due: number;
  start: number;
  end: number;
  status: FilingStatus;
  locked: boolean;
  rows: FilingRow[];
}

type Lane = { id: string; label: string; group: true } | { id: string; label: string; group: false; items: WindowItem[] };

function plain(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function FilingWindows({
  rows,
  fyStartYear,
  todayIso,
  now,
  mayWrite,
  hrefOf,
}: {
  rows: FilingRow[];
  fyStartYear: number;
  todayIso: string;
  now: Date;
  /** Managers, admins and super admins move windows; the server checks the role again. */
  mayWrite: boolean;
  hrefOf: (row: FilingRow) => string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const start = Date.UTC(fyStartYear, 3, 1);
  const end = Date.UTC(fyStartYear + 1, 2, 31);
  const days = Math.round((end - start) / DAY);
  const dayN = (ms: number) => Math.round((ms - start) / DAY);

  // Saved moves stay on screen until the register refetches.
  const [saved, setSaved] = useState<Record<string, Win>>({});
  const lanes = useMemo<Lane[]>(() => {
    const inYear = rows.filter((r) => {
      const t = dayMs(r.dueDate);
      return t >= start && t <= end;
    });
    const areas = [...new Set(inYear.map((r) => r.compliance))].sort((a, b) => a.localeCompare(b));
    const out: Lane[] = [];
    for (const area of areas) {
      const inArea = inYear.filter((r) => r.compliance === area);
      out.push({ id: `g-${area}`, label: areaLabel(area), group: true });
      const names = [...new Set(inArea.map((r) => r.particular))].sort((a, b) => a.localeCompare(b));
      for (const name of names) {
        const byDue = new Map<string, FilingRow[]>();
        for (const r of inArea.filter((x) => x.particular === name)) {
          const k = r.dueDate.slice(0, 10);
          byDue.set(k, [...(byDue.get(k) ?? []), r]);
        }
        const items: WindowItem[] = [...byDue.entries()].map(([dueIso, list]) => {
          const due = dayMs(dueIso);
          const set = list.find((r) => r.windowFrom && r.windowTo);
          const prep = PREP[list[0]!.frequency] ?? PREP.monthly!;
          const status = worstStatus(list.map((r) => filingStatus(r, now)));
          return {
            id: `${area}|${name}|${dueIso}`,
            title: `${name} · ${plain(due)}${list.length > 1 ? ` · ${list.length} clients` : ''}`,
            due,
            start: set ? dayMs(set.windowFrom!) : due - prep * DAY,
            end: set ? dayMs(set.windowTo!) : due,
            status,
            locked: list.every((r) => Boolean(r.filedOn)),
            rows: list,
          };
        });
        out.push({ id: `l-${area}-${name}`, label: name, group: false, items });
      }
    }
    return out;
  }, [rows, start, end, now]);

  const vp = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [ppd, setPpd] = useState<number | null>(null);
  const [live, setLive] = useState<{ id: string; s: number; e: number } | null>(null);
  const drag = useRef<{ item: WindowItem; mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; snap: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    setWidth(el.clientWidth || 800);
    // Test runners and very old browsers have no ResizeObserver; the first width then stays.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const minP = width / days;
  const fitP = Math.max(minP, Math.min(ZMAX, width / 61));
  const p = Math.max(minP, Math.min(ZMAX, ppd ?? fitP));
  const level = p >= 20 ? 'Days' : p >= 7 ? 'Weeks' : 'Months';
  const snap = p < 7 ? 7 : 1;

  // On first paint, scroll to the start of this month when it is in the year.
  const scrolled = useRef(false);
  useEffect(() => {
    const el = vp.current;
    if (!el || scrolled.current || width === 800) return;
    scrolled.current = true;
    const t = dayMs(`${todayIso.slice(0, 7)}-01`);
    if (t >= start && t <= end) el.scrollLeft = dayN(t) * fitP - 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const zoom = (np: number) => {
    const el = vp.current;
    const mid = el ? (el.scrollLeft + el.clientWidth / 2) / p : 0;
    const next = Math.max(minP, Math.min(ZMAX, np));
    setPpd(next);
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = mid * next - el.clientWidth / 2;
    });
  };

  const winOf = (it: WindowItem): Win =>
    live && live.id === it.id ? { s: live.s, e: live.e } : (saved[it.id] ?? { s: dayN(it.start), e: dayN(it.end) });

  async function write(it: WindowItem, w: Win) {
    const targets = it.rows.filter((r) => !r.filedOn);
    const prev: Prev[] = targets.map((r) => ({
      id: r.id,
      window: r.windowFrom && r.windowTo ? { from: r.windowFrom, to: r.windowTo } : null,
    }));
    const before = winOf(it);
    const from = isoOf(start + w.s * DAY);
    const to = isoOf(start + w.e * DAY);
    setSaved((m) => ({ ...m, [it.id]: w }));
    try {
      await Promise.all(targets.map((r) => setFilingWindowInDb(r.id, { from, to })));
      await queryClient.invalidateQueries({ queryKey: ['filings'] });
      toastUndo(`Window · ${plain(start + w.s * DAY)} to ${plain(start + w.e * DAY)}`, () => {
        setSaved((m) => ({ ...m, [it.id]: before }));
        void Promise.all(prev.map((x) => setFilingWindowInDb(x.id, x.window)))
          .then(() => queryClient.invalidateQueries({ queryKey: ['filings'] }))
          .catch((err) => toastError('Could not undo the window', errorMessage(err)));
      });
    } catch (err) {
      setSaved((m) => ({ ...m, [it.id]: before }));
      toastError('Could not save the window', errorMessage(err));
    }
  }

  const open = (it: WindowItem) => router.push(hrefOf(it.rows[0]!));

  const onDown = (e: PointerEvent, it: WindowItem, mode: 'move' | 'start' | 'end') => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const w = winOf(it);
    drag.current = { item: it, mode, x0: e.clientX, s0: w.s, e0: w.e, snap, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    if (Math.abs(e.clientX - g.x0) > 3) g.moved = true;
    if (!mayWrite || g.item.locked || !g.moved) return;
    const dd = Math.round((e.clientX - g.x0) / p / g.snap) * g.snap;
    let s = g.s0;
    let en = g.e0;
    if (g.mode === 'move') {
      s += dd;
      en += dd;
    } else if (g.mode === 'start') s = Math.min(en - 1, s + dd);
    else en = Math.max(s + 1, en + dd);
    setLive({ id: g.item.id, s: Math.max(0, s), e: Math.min(days, en) });
  };
  const onUp = () => {
    const g = drag.current;
    drag.current = null;
    const l = live;
    setLive(null);
    if (!g) return;
    if (!g.moved) {
      open(g.item);
      return;
    }
    if (g.item.locked && mayWrite) {
      toastUndo(`${g.item.title} is already filed, so its window is locked`);
      return;
    }
    if (mayWrite && l && l.id === g.item.id && (l.s !== g.s0 || l.e !== g.e0)) void write(g.item, { s: l.s, e: l.e });
  };
  const onKey = (e: KeyboardEvent, it: WindowItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      open(it);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!mayWrite) return;
    e.preventDefault();
    if (it.locked) {
      toastUndo(`${it.title} is already filed, so its window is locked`);
      return;
    }
    const w = winOf(it);
    const d = (e.key === 'ArrowRight' ? 1 : -1) * snap;
    if (e.shiftKey) void write(it, { s: w.s, e: Math.min(days, Math.max(w.s + 1, w.e + d)) });
    else if (w.s + d >= 0 && w.e + d <= days) void write(it, { s: w.s + d, e: w.e + d });
  };

  const ruler: ReactNode[] = [];
  for (let n = 0; n <= days; n++) {
    const d = new Date(start + n * DAY);
    if (d.getUTCDate() === 1)
      ruler.push(
        <span
          key={`m${n}`}
          className="absolute top-1 h-3.5 whitespace-nowrap border-l border-line pl-1.5 text-[11px] font-medium leading-[14px] text-ink-2"
          style={{ left: n * p }}
        >
          {MON[d.getUTCMonth()]} {d.getUTCFullYear()}
        </span>,
      );
    const tick = level === 'Days' ? true : level === 'Weeks' ? d.getUTCDay() === 1 : d.getUTCDate() === 15;
    if (tick)
      ruler.push(
        <span
          key={`t${n}`}
          className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap text-[10.5px] tabular-nums text-ink-faint"
          style={{ left: n * p + (level === 'Days' ? p / 2 : 0) }}
        >
          {level === 'Weeks' ? plain(d.getTime()) : d.getUTCDate()}
        </span>,
      );
  }

  const todayN = dayN(dayMs(todayIso));

  if (!lanes.length) {
    return <p className="px-1 py-6 text-center text-[13px] text-ink-faint">No filings in this year</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-sunken p-0.5" role="group" aria-label="Zoom the timeline">
          <Button size="icon" variant="ghost" className="h-7 w-7 min-w-0" onClick={() => zoom(p / 1.5)} disabled={p <= minP + 0.01} aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
          </Button>
          <span className="min-w-[56px] text-center text-[12px] font-medium text-ink-muted">{level}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7 min-w-0" onClick={() => zoom(p * 1.5)} disabled={p >= ZMAX - 0.01} aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => zoom(fitP)}>
            Fit
          </Button>
        </span>
      </div>
      <div className="grid select-none grid-cols-[minmax(96px,140px)_minmax(0,1fr)] overflow-hidden rounded-md border border-line">
        <div className="border-r border-line">
          <div className="h-10 border-b border-line" />
          {lanes.map((l) =>
            l.group ? (
              <div key={l.id} className="flex h-6 items-center bg-surface-sunken px-2.5 text-[11.5px] font-medium text-ink-muted">
                {l.label}
              </div>
            ) : (
              <div key={l.id} className="flex h-[30px] items-center border-t border-line-soft px-2.5 text-[12px] font-medium text-ink" title={l.label}>
                <span className="truncate">{l.label}</span>
              </div>
            ),
          )}
        </div>
        <div
          ref={vp}
          className="relative overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            drag.current = null;
            setLive(null);
          }}
        >
          <div className="relative" style={{ width: days * p }}>
            <div className="relative h-10 border-b border-line bg-surface-raised">{ruler}</div>
            {lanes.map((l) =>
              !('items' in l) ? (
                <div key={l.id} className="h-6 bg-surface-sunken" />
              ) : (
                <div key={l.id} className="relative h-[30px] border-t border-line-soft">
                  {l.items.map((it) => {
                    const w = winOf(it);
                    const due = dayN(it.due);
                    const late = w.e > due && !it.locked;
                    const movable = mayWrite && !it.locked;
                    const tip = `${it.title} · window ${plain(start + w.s * DAY)} to ${plain(start + w.e * DAY)} · due ${plain(it.due)}${
                      it.locked ? ' · filed' : late ? ' · ends after the due date' : ''
                    }`;
                    return (
                      <span key={it.id} className="contents">
                        <span
                          role="slider"
                          tabIndex={0}
                          aria-label={tip}
                          aria-readonly={!movable || undefined}
                          aria-valuemin={0}
                          aria-valuemax={days}
                          aria-valuenow={w.s}
                          aria-valuetext={`${plain(start + w.s * DAY)} to ${plain(start + w.e * DAY)}`}
                          title={tip}
                          onPointerDown={(e) => onDown(e, it, 'move')}
                          onKeyDown={(e) => onKey(e, it)}
                          className={cn(
                            'group absolute top-[7px] h-4 rounded-bar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-line',
                            STATUS_FILL[it.status],
                            it.locked ? 'cursor-pointer opacity-70' : movable ? 'cursor-grab' : 'cursor-pointer',
                            late && 'ring-1 ring-danger',
                            live?.id === it.id && 'cursor-grabbing ring-2 ring-brand-line',
                          )}
                          style={{ left: w.s * p, width: Math.max(6, (w.e - w.s) * p) }}
                        >
                          {movable ? (
                            <>
                              <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onDown(e, it, 'start')} aria-hidden />
                              <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onDown(e, it, 'end')} aria-hidden />
                            </>
                          ) : null}
                        </span>
                        <span
                          className={cn('pointer-events-none absolute top-1 h-[22px] w-0.5 rounded-bar', late ? 'bg-danger' : 'bg-navy')}
                          style={{ left: due * p }}
                          aria-hidden
                        />
                      </span>
                    );
                  })}
                </div>
              ),
            )}
            {todayN >= 0 && todayN <= days ? (
              <span className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-highlight-bright" style={{ left: todayN * p }} aria-hidden />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
