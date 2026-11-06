'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, Download, Search } from 'lucide-react';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AreaPill, Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { AuditEventRow } from '@/lib/audit/audit-log';
import { formatAuditMetadata, getAuditTargetType } from '@/lib/audit/audit-log';
import { mapDbRoleToAppRole, ROLE_UI_LABEL } from '@/lib/auth';
import {
  AUDIT_AREAS,
  AUDIT_CATEGORY_LABELS,
  auditAreaOf,
  auditChange,
  auditFiltersSet,
  auditResultWord,
  defaultAuditFilters,
  filterAuditEvents,
  type AuditFilters,
  type AuditResultWord,
  auditEventTitle,
} from '@/views/admin/audit-log/audit-filters';
import { auditEventsCsv, downloadCsv } from '@/views/admin/audit-log/audit-csv';
import { logBrowserExport } from '@/lib/exports/log-export-client';

/** Plain date and time, for example "14 Oct 10:42" (R-05); the year shows only when it is not this year. */
function plainWhen(iso: string): string {
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM HH:mm' : 'd MMM yyyy HH:mm');
}

function actorName(ev: AuditEventRow): string {
  return ev.actor_name?.trim() || ev.actor_email?.trim() || 'Unknown actor';
}

const roleLabel = (ev: AuditEventRow) => ROLE_UI_LABEL[mapDbRoleToAppRole(ev.actor_role)];

const RESULT_TONE: Record<AuditResultWord, ChipTone> = { Done: 'ok', 'Sent back': 'warn', Failed: 'bad', Denied: 'warn' };

/** The Result cell (prototype Audit, G-28): a chip on every row. Done green, Sent back and Denied amber, Failed red. */
function ResultChip({ ev }: { ev: AuditEventRow }) {
  const word = auditResultWord(ev);
  return (
    <Chip fixed tone={RESULT_TONE[word]}>
      {word}
    </Chip>
  );
}

/** Local day key, so the day dialog groups events by the date the person sees. */
const dayKey = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/** Filters in the card head (prototype Audit): search, area, who, export. */
function AuditHeadFilters({
  filters,
  onChange,
  events,
  onExport,
}: {
  filters: AuditFilters;
  onChange: (patch: Partial<AuditFilters>) => void;
  events: AuditEventRow[];
  onExport: () => void;
}) {
  const searchId = useId();
  const roleId = useId();
  const categoryId = useId();
  const count = (key: AuditFilters['category']) => events.filter((e) => auditAreaOf(e.action) === key).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={searchId} className="relative inline-flex">
        <span className="sr-only">Search the audit log</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          id={searchId}
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search"
          className="h-[30px] w-[170px] rounded-md border-1.5 border-line-strong bg-surface-raised pl-8 pr-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-focus-ring/25"
        />
      </label>

      <label htmlFor={categoryId} className="sr-only">
        Area
      </label>
      <Select value={filters.category} onValueChange={(v) => onChange({ category: v as AuditFilters['category'] })}>
        <SelectTrigger id={categoryId} className="h-[30px] w-[160px] text-[13px]">
          <SelectValue placeholder="All areas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All areas</SelectItem>
          {AUDIT_AREAS.map((key) => (
            <SelectItem key={key} value={key}>
              {AUDIT_CATEGORY_LABELS[key]} · {count(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label htmlFor={roleId} className="sr-only">
        Who
      </label>
      <Select value={filters.role} onValueChange={(v) => onChange({ role: v as AuditFilters['role'] })}>
        <SelectTrigger id={roleId} className="h-[30px] w-[140px] text-[13px]">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          <SelectItem value="sbc">SBC</SelectItem>
          <SelectItem value="super_admin">Super admin</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="manager">Manager</SelectItem>
          <SelectItem value="intern">Project lead</SelectItem>
          <SelectItem value="client">Client</SelectItem>
        </SelectContent>
      </Select>

      <Button size="sm" variant="outline" onClick={onExport} disabled={events.length === 0}>
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export
      </Button>
    </div>
  );
}

/** One event in a side panel (prototype Audit SidePanel): date, action, area and result, the facts, the change, and a link to the record. */
function AuditEventPanel({
  ev,
  projectName,
  recordHref,
  onClose,
}: {
  ev: AuditEventRow | null;
  projectName: string | null;
  recordHref: string | null;
  onClose: () => void;
}) {
  const metadataText = ev ? formatAuditMetadata(ev.metadata) : null;
  const change = ev ? auditChange(ev.metadata) : null;
  return (
    <Sheet open={ev !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-[440px]">
        {ev ? (
          <div className="grid flex-1 content-start gap-5">
            <div className="pr-8">
              <p className="text-[12.5px] text-ink-muted">
                {format(new Date(ev.created_at), 'd MMM yyyy · HH:mm')} ·{' '}
                {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
              </p>
              <SheetTitle className="mt-1 text-[18px] font-medium leading-snug">{auditEventTitle(ev.action)}</SheetTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AreaPill area={AUDIT_CATEGORY_LABELS[auditAreaOf(ev.action)]} />
                <ResultChip ev={ev} />
              </div>
            </div>

            <dl className="grid gap-3 text-[13.5px]">
              {ev.summary ? (
                <div>
                  <dt className="text-[12.5px] text-ink-muted">Summary</dt>
                  <dd className="text-ink">{ev.summary}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[12.5px] text-ink-muted">Target</dt>
                <dd className="text-ink">
                  {getAuditTargetType(ev.action)}
                  {projectName ? ` · ${projectName}` : ''}
                </dd>
                {ev.engagement_id ? <dd className="font-mono text-[12px] text-ink-muted">{ev.engagement_id}</dd> : null}
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-muted">By</dt>
                <dd className="text-ink">
                  {actorName(ev)} · {roleLabel(ev)}
                </dd>
                {ev.actor_name && ev.actor_email ? <dd className="text-[12.5px] text-ink-muted">{ev.actor_email}</dd> : null}
              </div>
            </dl>

            {change ? (
              <section>
                <h3 className="mb-1.5 text-[12.5px] font-medium text-ink-muted">Change</h3>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  <div className="min-w-0 rounded-md border-1.5 border-line bg-surface-sunken px-3 py-2">
                    <div className="text-[12.5px] text-ink-muted">Before</div>
                    <div className="truncate text-[13.5px] font-medium text-ink-muted">{change.before}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-faint" strokeWidth={1.6} aria-hidden />
                  <div className="min-w-0 rounded-md border-1.5 border-brand-line bg-brand-soft px-3 py-2">
                    <div className="text-[12.5px] text-ink-muted">After</div>
                    <div className="truncate text-[13.5px] font-medium text-ink">{change.after}</div>
                  </div>
                </div>
              </section>
            ) : null}

            {metadataText ? (
              <section>
                <h3 className="mb-1.5 text-[12.5px] font-medium text-ink-muted">Details</h3>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border-1.5 border-line bg-surface-sunken px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-2">
                  {metadataText}
                </pre>
              </section>
            ) : null}
            <p className="font-mono text-[12px] text-ink-faint">{ev.action}</p>
          </div>
        ) : null}
        {ev && recordHref ? (
          <div className="mt-5 flex justify-end border-t border-line-soft pt-4">
            <Button asChild>
              <Link href={recordHref}>Open project</Link>
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** A date opens that day (prototype Audit day dialog): tabs for the last seven days with events, then the rows. */
function AuditDayDialog({
  day,
  onDayChange,
  events,
  onPick,
}: {
  day: string | null;
  onDayChange: (day: string | null) => void;
  events: AuditEventRow[];
  onPick: (ev: AuditEventRow) => void;
}) {
  const days = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const ev of events) {
      const k = dayKey(ev.created_at);
      const hit = map.get(k);
      if (hit) hit.count += 1;
      else map.set(k, { label: format(new Date(ev.created_at), 'd MMM'), count: 1 });
    }
    return [...map.entries()].slice(0, 7);
  }, [events]);
  const rows = day ? events.filter((ev) => dayKey(ev.created_at) === day) : [];
  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onDayChange(null)}>
      <DialogContent className="flex max-h-[min(640px,calc(100vh-40px))] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-line-soft px-5 pb-3 pt-5 pr-12">
          <DialogTitle className="text-[17px] font-medium leading-6">
            {day ? format(new Date(`${day}T00:00:00`), 'EEEE, d MMMM yyyy') : ''}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-muted">
            {rows.length} {rows.length === 1 ? 'event' : 'events'}
          </DialogDescription>
        </div>
        {days.length > 1 ? (
          <div className="overflow-x-auto border-b border-line-soft px-4 py-2 md:px-5">
            <SpectrumTabs
              label="Day"
              items={days.map(([k, d]) => ({ key: k, label: d.label, count: d.count }))}
              value={day ?? ''}
              onChange={(k) => onDayChange(k)}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onPick(ev)}
              className="flex min-h-[52px] w-full items-center gap-3 border-b border-line-soft px-5 py-2 text-left last:border-b-0 hover:bg-surface-sunken"
            >
              <span className="w-12 flex-none text-[13px] tabular-nums text-ink-muted">{format(new Date(ev.created_at), 'HH:mm')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{auditEventTitle(ev.action)}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {ev.summary ? `${ev.summary} · ` : ''}
                  {actorName(ev)}
                </span>
              </span>
              <AreaPill area={AUDIT_CATEGORY_LABELS[auditAreaOf(ev.action)]} className="hidden sm:inline-flex" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The audit card (prototype AuditScreen, R-07): filters in the head, T1 rows, page numbers
 * under the table. A row opens the event in a side panel.
 */
export function AuditTable({
  title,
  events,
  engagementsByDbId,
  loading,
  error,
  emptyMessage,
  filters,
  onFiltersChange,
  showTarget = true,
  exportName,
  onLoadOlder,
  loadingOlder = false,
  recordHref,
}: {
  title: string;
  events: AuditEventRow[];
  engagementsByDbId: Map<string, string>;
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  filters: AuditFilters;
  onFiltersChange: (patch: Partial<AuditFilters>) => void;
  showTarget?: boolean;
  exportName: string;
  /** Set while an older page exists (G-28); the button fetches it and the rows append. */
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  /** The record an event belongs to (its project), for the panel's footer link; null when there is none. */
  recordHref?: (ev: AuditEventRow) => string | null;
}) {
  const [picked, setPicked] = useState<AuditEventRow | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const filtered = useMemo(
    () => filterAuditEvents(events, filters, engagementsByDbId),
    [events, filters, engagementsByDbId],
  );
  const projectOf = (ev: AuditEventRow) =>
    ev.engagement_id ? engagementsByDbId.get(ev.engagement_id) ?? 'Unknown project' : null;

  const columns: EFilingColumn<AuditEventRow>[] = [
    {
      key: 'when',
      header: 'When',
      width: '120px',
      render: (ev) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDay(dayKey(ev.created_at));
          }}
          aria-label={`Show all events on ${format(new Date(ev.created_at), 'd MMM')}`}
          title={formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
          className="whitespace-nowrap text-[13px] tabular-nums text-brand-text hover:underline"
        >
          <time dateTime={ev.created_at}>{plainWhen(ev.created_at)}</time>
        </button>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      render: (ev) => {
        const label = auditEventTitle(ev.action);
        return (
          <span className="block min-w-0">
            <button
              type="button"
              className="block max-w-full truncate text-left font-medium text-ink hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setPicked(ev);
              }}
            >
              {label}
            </button>
            {ev.summary && ev.summary !== label ? (
              <span className="block truncate text-[12.5px] text-ink-muted">{ev.summary}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'area',
      header: 'Area',
      width: '124px',
      render: (ev) => <AreaPill area={AUDIT_CATEGORY_LABELS[auditAreaOf(ev.action)]} />,
    },
    {
      key: 'who',
      header: 'Who',
      width: '180px',
      render: (ev) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{actorName(ev)}</span>
          <span className="block truncate text-[12.5px] text-ink-muted">{roleLabel(ev)}</span>
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      width: '124px',
      render: (ev) => <ResultChip ev={ev} />,
    },
    ...(showTarget
      ? [
          {
            key: 'target',
            header: 'Target',
            width: '180px',
            render: (ev: AuditEventRow) => (
              <span className="block min-w-0">
                <span className="block truncate text-ink">{projectOf(ev) ?? '—'}</span>
                <span className="block truncate text-[12.5px] text-ink-muted">{getAuditTargetType(ev.action)}</span>
              </span>
            ),
          },
        ]
      : []),
  ];

  const isFiltered = auditFiltersSet(filters);

  return (
    <section className="surface min-w-0 overflow-hidden">
      <header className="flex min-h-[52px] flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title="Audit log" />
        <h2 className="whitespace-nowrap text-[15px] font-medium text-ink">{title}</h2>
        {!loading ? (
          <span className="truncate text-[13px] text-ink-muted">
            {filtered.length === events.length ? `${events.length} events` : `${filtered.length} of ${events.length} events`}
          </span>
        ) : null}
        <div className="ml-auto">
          <AuditHeadFilters
            filters={filters}
            onChange={onFiltersChange}
            events={events}
            onExport={() => {
              const csv = auditEventsCsv(filtered, engagementsByDbId);
              downloadCsv(csv, exportName);
              logBrowserExport('audit_log', exportName, csv);
            }}
          />
        </div>
      </header>

      {error ? (
        <div role="alert" className="border-b border-line-soft bg-warning-soft px-4 py-3 text-[13px] text-warning">
          {error}
        </div>
      ) : null}

      <div>
        {loading ? (
          <EFilingGrid columns={columns} rows={[] as AuditEventRow[]} rowKey={(ev) => ev.id} minWidth={showTarget ? 944 : 764} caption={title} loading />
        ) : events.length === 0 ? (
          <EmptyState title={emptyMessage} className="m-4" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No events match these filters"
            className="m-4"
            action={
              <Button size="sm" variant="outline" onClick={() => onFiltersChange(defaultAuditFilters())}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EFilingGrid
            columns={columns}
            rows={filtered}
            rowKey={(ev) => ev.id}
            pageSize={10}
            minWidth={showTarget ? 944 : 764}
            caption={title}
            stickyFirstColumn
            onRowClick={(ev: AuditEventRow) => setPicked(ev)}
            footer={
              <span className="flex items-center gap-2">
                {isFiltered ? (
                  <Button size="sm" variant="ghost" onClick={() => onFiltersChange(defaultAuditFilters())}>
                    Clear filters
                  </Button>
                ) : null}
                {onLoadOlder ? (
                  <Button size="sm" variant="outline" disabled={loadingOlder} onClick={onLoadOlder}>
                    {loadingOlder ? 'Loading…' : 'Load older'}
                  </Button>
                ) : null}
              </span>
            }
          />
        )}
      </div>

      <AuditEventPanel
        ev={picked}
        projectName={picked ? projectOf(picked) : null}
        recordHref={picked && recordHref ? recordHref(picked) : null}
        onClose={() => setPicked(null)}
      />
      <AuditDayDialog
        day={day}
        onDayChange={setDay}
        events={filtered}
        onPick={(ev) => {
          setDay(null);
          setPicked(ev);
        }}
      />
    </section>
  );
}
