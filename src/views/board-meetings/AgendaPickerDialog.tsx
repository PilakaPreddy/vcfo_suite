'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronsLeft, GripVertical, Lock, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/spectrum-chip';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { CIRCULATION_ITEM, FIXED_END, FIXED_TOP, SUGGESTED, type AgendaItem, type MeetingType } from '@/lib/board-meetings/model';
import { agendaTextOf, placeholdersIn } from '@/lib/board-meetings/rules';
import { useAgendaLibrary, useSaveTemplate, type LibraryItemDto } from '@/hooks/use-board-meetings';
import { WithBlanks } from './parts';


/** Focus the sub-point field when it opens (instead of autoFocus). */
const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

/**
 * AGENDA PICKER — the two-box pop-up of the board meeting agendas page: this meeting's agenda on
 * the left, the SBC agenda library (224 items, 16 topics) on the right, arrows between them.
 * Fixed items stay at the top and the end; sub-points go one level deep (decision D1).
 */

const SHORT: Record<string, string> = {
  'Opening and Procedural Matters': 'Procedural',
  'First Board Meeting and Incorporation': 'First meeting',
  'Appointment, Resignation and Changes in Directors / KMP': 'Directors and KMP',
  'Finance, Accounts, Audit and Banking': 'Finance and audit',
  'Share Capital, Securities and Shareholder Matters': 'Share capital',
  'Statutory, Secretarial, Tax and Regulatory Compliance': 'Compliance',
  'Business Operations, Assets, Agreements and Authorisations': 'Operations',
  'Related Party Transactions, Loans, Investments and Contracts': 'RPT and loans',
  'Human Resources, Policies and Workplace Matters': 'HR',
  'Board Committees and Governance': 'Committees',
  'General Meetings and Annual General Meeting': 'General meetings',
  'Corporate Social Responsibility': 'CSR',
  'Foreign Investment, FEMA and Cross-Border Matters': 'FEMA',
  'Governance, Ethics, Risk and Other Matters': 'Governance',
  'Restructuring, Conversion, Merger and Closure': 'Restructuring',
  'Listed Entity and SEBI-Specific Matters': 'Listed / SEBI',
};

function kindOf(i: LibraryItemDto): 'Resolution' | 'Noting' {
  return /Approve|Elect|Confirm|Recommend|Authorise/i.test(i.action) ? 'Resolution' : 'Noting';
}

function appTone(a: string): 'ok' | 'prog' | 'teal' | 'warn' {
  if (/Every meeting/.test(a)) return 'ok';
  if (/Periodic|Annual/.test(a)) return 'prog';
  if (/First Board/.test(a)) return 'teal';
  return 'warn';
}

let seq = 0;
const key = () => `p${Date.now().toString(36)}${(seq += 1).toString(36)}`;

export function AgendaPickerDialog({
  open,
  onOpenChange,
  meetingType,
  agenda,
  engagementId,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetingType: MeetingType;
  agenda: AgendaItem[];
  engagementId: string;
  onApply: (next: AgendaItem[]) => void;
}) {
  const lib = useAgendaLibrary();
  const saveTemplate = useSaveTemplate();
  const [left, setLeft] = useState<AgendaItem[]>(agenda);
  const [selL, setSelL] = useState<string[]>([]);
  const [selR, setSelR] = useState<string[]>([]);
  const [filter, setFilter] = useState('sug');
  const [query, setQuery] = useState('');
  const [hideListed, setHideListed] = useState(true);
  const [custom, setCustom] = useState('');
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subText, setSubText] = useState('');

  useEffect(() => {
    if (open) {
      setLeft(agenda);
      setSelL([]);
      setSelR([]);
      setQuery('');
      setFilter('sug');
    }
  }, [open, agenda]);

  const items = useMemo(() => lib.data?.items ?? [], [lib.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const fixed = useMemo(() => new Set([...FIXED_TOP[meetingType], ...FIXED_END]), [meetingType]);
  const inAgenda = new Set(left.map((a) => a.libraryId).filter(Boolean) as string[]);
  const q = query.trim().toLowerCase();
  const pool = items.filter((i) => !inAgenda.has(i.id) && !fixed.has(i.id) && !(hideListed && /Listed|SEBI/i.test(i.applicability + i.topic)));
  const searched = q ? pool.filter((i) => `${i.id} ${i.scenario} ${i.wording} ${i.topic}`.toLowerCase().includes(q)) : pool;
  const sug = searched.filter((i) => SUGGESTED[meetingType].includes(i.id));
  const groups: Array<{ label: string; rows: LibraryItemDto[]; sug?: boolean }> = [];
  if (q || filter === 'sug' || filter === 'all') if (sug.length) groups.push({ label: 'Suggested for this meeting', rows: sug, sug: true });
  if (q || filter === 'all') {
    const topics = [...new Set(searched.map((i) => i.topic))];
    for (const t of topics) {
      const rows = searched.filter((i) => i.topic === t && !SUGGESTED[meetingType].includes(i.id));
      if (rows.length) groups.push({ label: t, rows });
    }
  } else if (filter !== 'sug') {
    const rows = searched.filter((i) => i.topic === filter);
    if (rows.length) groups.push({ label: filter, rows });
  }

  const order = (list: AgendaItem[]) => {
    const top = FIXED_TOP[meetingType].map((id) => list.find((a) => a.libraryId === id)).filter(Boolean) as AgendaItem[];
    const end = FIXED_END.map((id) => list.find((a) => a.libraryId === id)).filter(Boolean) as AgendaItem[];
    const mid = list.filter((a) => !a.libraryId || !fixed.has(a.libraryId));
    return [...top.map((a) => ({ ...a, fixed: 'top' as const })), ...mid.map((a) => ({ ...a, fixed: undefined })), ...end.map((a) => ({ ...a, fixed: 'end' as const }))];
  };
  const add = (ids: string[]) => {
    const fresh = ids
      .map((id) => byId.get(id))
      .filter((i): i is LibraryItemDto => Boolean(i))
      .map((i) => ({ key: key(), libraryId: i.id, text: agendaTextOf(i.wording), subs: [] }));
    setLeft((l) => order([...l, ...fresh]));
    setSelR([]);
  };
  const remove = (keys: string[]) => {
    setLeft((l) => l.filter((a) => a.fixed || !keys.includes(a.key)));
    setSelL([]);
  };
  const move = (k: string, dir: -1 | 1) =>
    setLeft((l) => {
      const i = l.findIndex((a) => a.key === k);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.length || l[j]!.fixed || l[i]!.fixed) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const blanks = left.reduce((n, a) => n + placeholdersIn(a.text).length + a.subs.reduce((m, s) => m + placeholdersIn(s).length, 0), 0);
  const resolutions = left.filter((a) => a.libraryId && byId.get(a.libraryId) && kindOf(byId.get(a.libraryId)!) === 'Resolution').length;
  const subCount = left.reduce((n, a) => n + a.subs.length, 0);
  const filters = [['sug', 'Suggested'], ['all', 'All'], ...Object.keys(SHORT).filter((t) => t !== 'Opening and Procedural Matters' && (!hideListed || !/SEBI/.test(t))).map((t) => [t, SHORT[t]!])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1320px] gap-0 overflow-hidden p-0 sm:max-w-[1320px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-1.5 border-line px-5 py-3.5">
          <div className="min-w-0">
            <DialogTitle className="text-[16px] font-medium">Agenda · pick from the SBC library</DialogTitle>
            <DialogDescription className="text-[12.5px] text-ink-muted">
              {items.length} items in {lib.data?.topics.length ?? 16} topics. Double-click moves an item. Fixed items stay at the top and the end.
            </DialogDescription>
          </div>
        </div>
        <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col">
            <div className="flex min-h-[52px] items-center justify-between gap-2 border-b border-line-soft px-4">
              <h3 className="m-0 flex items-center gap-2 text-[15px] font-medium">
                This meeting&apos;s agenda <span className="rounded-[4px] bg-brand-soft px-1.5 text-[12px] font-medium text-brand-text">{left.length}</span>
              </h3>
              <Button size="sm" variant="secondary" onClick={() => remove(left.filter((a) => !a.fixed).map((a) => a.key))}>
                Clear
              </Button>
            </div>
            <ol className="m-0 flex max-h-[520px] flex-1 list-none flex-col gap-0.5 overflow-auto p-1.5" aria-label="This meeting's agenda">
              {left.map((a, i) => {
                const lib = a.libraryId ? byId.get(a.libraryId) : null;
                const sel = selL.includes(a.key);
                return (
                  <li key={a.key} className="flex flex-col gap-0.5">
                    <div
                      onDoubleClick={() => !a.fixed && remove([a.key])}
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border-1.5 px-2.5 py-2',
                        sel ? 'border-brand/45 bg-brand-soft' : 'border-transparent',
                        a.fixed ? 'bg-surface-sunken' : 'bg-surface',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-6 text-right font-mono text-[12px] text-ink-faint">{i + 1}</span>
                        {a.fixed ? null : (
                          <button type="button" aria-label={`Select item ${i + 1}`} aria-pressed={sel} onClick={() => setSelL((s) => toggle(s, a.key))} className="text-ink-faint">
                            <GripVertical className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <b className="text-[13.5px] font-medium leading-snug">
                          <WithBlanks text={a.text} />
                        </b>
                        <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
                          {a.libraryId ? <span className="font-mono text-[11px]">{a.libraryId}</span> : <Tag>Own item</Tag>}
                          {lib ? <Tag tone={kindOf(lib) === 'Resolution' ? 'prog' : 'idle'}>{kindOf(lib)}</Tag> : null}
                          {lib ? <Tag tone={appTone(lib.applicability)}>{lib.applicability}</Tag> : null}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        {a.fixed ? (
                          <Lock className="h-3.5 w-3.5 text-ink-faint" aria-label="Fixed item" />
                        ) : (
                          <>
                            <Button size="sm" variant="quiet" className="h-6 px-1.5 text-[11.5px]" onClick={() => setSubFor(a.key)}>
                              + Sub-point
                            </Button>
                            <Button size="iconSm" variant="quiet" aria-label="Move up" onClick={() => move(a.key, -1)}>
                              ↑
                            </Button>
                            <Button size="iconSm" variant="quiet" aria-label="Move down" onClick={() => move(a.key, 1)}>
                              ↓
                            </Button>
                            <Button size="iconSm" variant="quiet" aria-label={`Remove item ${i + 1}`} onClick={() => remove([a.key])}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </>
                        )}
                      </span>
                    </div>
                    {a.subs.map((s, j) => (
                      <div key={`${a.key}-${j}`} className="ml-9 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-r-md border-l-1.5 border-line-strong bg-surface px-2.5 py-1.5">
                        <span className="min-w-7 font-mono text-[11.5px] text-ink-faint">
                          {i + 1}.{j + 1}
                        </span>
                        <span className="text-[13px]">
                          <WithBlanks text={s} />
                          {a.libraryId === CIRCULATION_ITEM ? <Tag tone="teal" className="ml-2">Signed · locked</Tag> : null}
                        </span>
                        <Button
                          size="iconSm"
                          variant="quiet"
                          aria-label={`Remove sub-point ${i + 1}.${j + 1}`}
                          onClick={() => setLeft((l) => l.map((x) => (x.key === a.key ? { ...x, subs: x.subs.filter((_, k) => k !== j) } : x)))}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    {subFor === a.key ? (
                      <div className="ml-9 flex gap-2 py-1">
                        <Input
                          ref={focusOnMount}
                          value={subText}
                          onChange={(e) => setSubText(e.target.value)}
                          placeholder="Sub-point"
                          className="h-8"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && subText.trim()) {
                              setLeft((l) => l.map((x) => (x.key === a.key ? { ...x, subs: [...x.subs, subText.trim()] } : x)));
                              setSubText('');
                              setSubFor(null);
                            }
                            if (e.key === 'Escape') setSubFor(null);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (subText.trim()) setLeft((l) => l.map((x) => (x.key === a.key ? { ...x, subs: [...x.subs, subText.trim()] } : x)));
                            setSubText('');
                            setSubFor(null);
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="flex gap-2 border-t border-line-soft px-4 py-2.5">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own item" aria-label="Add your own item" className="h-9" />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!custom.trim()) return;
                  setLeft((l) => order([...l, { key: key(), libraryId: null, text: custom.trim(), subs: [] }]));
                  setCustom('');
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2.5 border-y-1.5 border-line bg-surface-sunken p-2.5 md:flex-col md:border-x-1.5 md:border-y-0">
            <Button size="icon" aria-label="Add the selected items to the agenda" disabled={!selR.length} onClick={() => add(selR)}>
              <ArrowLeft aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Remove the selected items from the agenda" disabled={!selL.length} onClick={() => remove(selL)}>
              <ArrowRight aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Add all suggested items" disabled={!sug.length} onClick={() => add(sug.map((i) => i.id))}>
              <ChevronsLeft aria-hidden />
            </Button>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex min-h-[52px] items-center justify-between gap-2 border-b border-line-soft px-4">
              <h3 className="m-0 flex items-center gap-2 text-[15px] font-medium">
                Agenda library <span className="rounded-[4px] bg-brand-soft px-1.5 text-[12px] font-medium text-brand-text">{pool.length}</span>
              </h3>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={hideListed} onChange={(e) => setHideListed(e.target.checked)} className="h-4 w-4 accent-[oklch(var(--brand))]" />
                Hide listed-company items
              </label>
            </div>
            <div className="px-4 pt-2.5">
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items, IDs or topics" aria-label="Search the agenda library" className="h-9" />
            </div>
            <div role="toolbar" aria-label="Filter the library" className="flex gap-1.5 overflow-x-auto border-b border-line-soft px-4 py-2">
              {filters.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => {
                    setFilter(k!);
                    setQuery('');
                  }}
                  className={cn('h-[26px] flex-none rounded-[4px] border-1.5 px-2 text-[12px] font-medium', filter === k ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface text-ink-muted')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex max-h-[520px] flex-1 flex-col gap-0.5 overflow-auto p-1.5" aria-label="Agenda library">
              {lib.isPending ? <p className="p-6 text-center text-[13px] text-ink-muted">Loading the library…</p> : null}
              {groups.map((g) => (
                <div key={g.label} className="flex flex-col gap-0.5">
                  <div className={cn('sticky top-0 z-[1] flex justify-between bg-surface px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.06em]', g.sug ? 'text-brand-text' : 'text-ink-muted')}>
                    <span>{g.label}</span>
                    <span>{g.rows.length}</span>
                  </div>
                  {g.rows.map((i) => {
                    const sel = selR.includes(i.id);
                    const fields = placeholdersIn(i.wording).length;
                    return (
                      <div
                        key={i.id}
                        onDoubleClick={() => add([i.id])}
                        className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border-1.5 px-2.5 py-2', sel ? 'border-brand/45 bg-brand-soft' : 'border-transparent bg-surface')}
                      >
                        <input type="checkbox" aria-label={`Select ${i.id}`} checked={sel} onChange={() => setSelR((s) => toggle(s, i.id))} className="h-4 w-4 accent-[oklch(var(--brand))]" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <b className="text-[13.5px] font-medium">{i.scenario}</b>
                          <span className="text-[12.5px] text-ink-2">{i.wording}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
                            <span className="font-mono text-[11px]">{i.id}</span>
                            <Tag tone={kindOf(i) === 'Resolution' ? 'prog' : 'idle'}>{kindOf(i)}</Tag>
                            <Tag tone={appTone(i.applicability)}>{i.applicability}</Tag>
                            {fields ? <Tag tone="warn">{fields === 1 ? '1 field' : `${fields} fields`}</Tag> : null}
                          </span>
                        </span>
                        <Button size="iconSm" variant="quiet" aria-label={`Add ${i.id}`} onClick={() => add([i.id])}>
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {!lib.isPending && groups.length === 0 ? <p className="p-6 text-center text-[13px] text-ink-muted">{q ? 'No items found' : 'All suggested items added'}</p> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-1.5 border-line bg-surface-sunken px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
            <strong className="font-medium text-ink">{left.length} items</strong>
            <span>·</span>
            <span>{subCount === 1 ? '1 sub-point' : `${subCount} sub-points`}</span>
            <span>·</span>
            <span>{resolutions === 1 ? '1 resolution' : `${resolutions} resolutions`}</span>
            {blanks ? <Tag tone="warn">{blanks === 1 ? '1 field to fill' : `${blanks} fields to fill`}</Tag> : null}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={saveTemplate.isPending}
              onClick={async () => {
                const name = window.prompt('Template name', `${meetingType === 'quarterly' ? 'Quarterly' : meetingType === 'annual' ? 'Annual accounts' : meetingType === 'first' ? 'First meeting' : 'Special'} · client`);
                if (!name) return;
                try {
                  await saveTemplate.mutateAsync({ name, meetingType, agenda: left, engagementId });
                  toastSaved('Template saved', { kind: 'saved', sub: name });
                } catch (e) {
                  toastError(errorMessage(e, 'Could not save the template'));
                }
              }}
            >
              Save as template
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onApply(left);
                onOpenChange(false);
              }}
            >
              Use this agenda
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
