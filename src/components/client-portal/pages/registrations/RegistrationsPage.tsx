'use client';

/**
 * Registrations (VCFO Spectrum RegistrationsScreen, owner decision D-06): the registration
 * phase of the client's incorporation checklist, one row per registration with its date
 * tile, the name, the area pill, the stored number (or an empty mark), the owner and the
 * status. Not-applicable steps sit in a folded "Not needed" group. The right rail keeps
 * three cards: Due in the next 15 days, Waiting on client, Progress flow.
 *
 * Data: the step model (`usePortalIncorporation`, the client-redacted checklist state),
 * the numbers stored on the credentials workbook (GET /api/client/credentials) and the
 * registration facts (GET /api/registrations, G-05): each row shows when it must be
 * renewed once an expiry is stored, with Due soon 30 days before and Overdue after it, and
 * a Renewals card lists those rows.
 */
import { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { SkeletonRows } from '@/components/ui/empty-state';
import { clientIncorporationStepPath } from '@/lib/projects/project-step-path';
import { todayIso } from '@/lib/client-portal/compliances';
import { usePortal } from '../../PortalProvider';
import { usePortalIncorporation } from '../../hooks';
import { usePageTips } from '../compliances/bits';
import { DateTile, Empty, GoLink, GroupHead, HeadSearch, Island, ListRow, SCard, StackedBar, WordPill, relativeDue, urgencyTint } from '../compliances/spectrum';
import { GROUP_ORDER, buildRegistrations, regDueWithin, regWaiting, type RegItem, type RegStatus } from './model';
import { REG_FILL, REG_ORDER, RegChip, regWord, regDate, registrationHref, useClientRegistrationFacts, useRegCredentials } from './parts';
import { renewalOf } from '@/lib/registrations/registration-facts';
import { fmtDM } from '@/lib/client-portal/compliances';
import '../../css/compliances-board.css';

export function RegistrationsList() {
  const today = todayIso();
  const { go, after } = usePortal();
  const root = useRef<HTMLDivElement>(null);
  usePageTips(root);
  const { model, loading } = usePortalIncorporation();
  const creds = useRegCredentials();
  const { facts } = useClientRegistrationFacts();
  const items = useMemo(() => buildRegistrations(model, creds.data, facts, { beforeCoi: !after }), [model, creds.data, facts, after]);
  const [view, setView] = useState<'status' | 'group'>('status');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RegStatus | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({ na: true });

  const active = items.filter((r) => !r.notNeeded);
  const notNeeded = items.filter((r) => r.notNeeded);
  const needle = search.trim().toLowerCase();
  const match = (r: RegItem) => !needle || `${r.name} ${r.area} ${r.group} ${r.number ?? ''}`.toLowerCase().includes(needle);
  const shown = active.filter((r) => match(r) && (!status || r.status === status));
  const sections = [
    ...(view === 'status'
      ? REG_ORDER.map((s) => ({ id: s, label: regWord(s), rows: shown.filter((r) => r.status === s) }))
      : GROUP_ORDER.map((g) => ({ id: g, label: g, rows: shown.filter((r) => r.group === g) }))),
    { id: 'na', label: 'Not needed', rows: status ? [] : notNeeded.filter(match) },
  ].filter((s) => s.rows.length);

  const due = regDueWithin(items, today, 15);
  const now = new Date(`${today}T00:00:00`);
  const renewals = active
    .map((r) => ({ r, renewal: renewalOf(r.facts, now) }))
    .filter((x) => x.renewal?.word)
    .sort((a, b) => a.renewal!.renewBy.localeCompare(b.renewal!.renewBy));
  const waiting = regWaiting(items);
  const count = (s: RegStatus) => active.filter((r) => r.status === s).length;

  const head = (
    <span className="flex flex-wrap items-center gap-2">
      <HeadSearch value={search} onChange={setSearch} label="Search registrations" onEnter={() => shown[0] && go(registrationHref(shown[0].id))} />
      <SpectrumTabs
        label="Group registrations"
        value={view}
        onChange={(k) => setView(k as 'status' | 'group')}
        items={[
          { key: 'status', label: 'By status' },
          { key: 'group', label: 'By regulator' },
        ]}
      />
    </span>
  );

  const list = loading ? (
    <div className="px-4 py-4 md:px-5" aria-busy="true" aria-label="Loading registrations">
      <SkeletonRows rows={5} />
    </div>
  ) : !items.length ? (
    <Empty>No registrations on your checklist</Empty>
  ) : !sections.length ? (
    <Empty
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSearch('');
            setStatus(null);
          }}
        >
          Clear
        </Button>
      }
    >
      None
    </Empty>
  ) : (
    <div>
      {status ? (
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2 md:px-5">
          <span className="inline-flex h-[30px] items-center gap-1.5 rounded-md border-1.5 border-brand-line bg-brand-soft pl-2.5 pr-1 text-[13px] font-medium text-brand-text">
            {regWord(status)}
            <button type="button" className="grid h-5 w-5 place-items-center rounded-sm hover:bg-surface-raised" aria-label="Clear the status filter" onClick={() => setStatus(null)}>
              ×
            </button>
          </span>
        </div>
      ) : null}
      {creds.isError && !facts ? (
        <p className="border-b border-line-soft px-4 py-2 text-[13px] text-ink-muted md:px-5" role="status">
          Registration numbers could not load
        </p>
      ) : null}
      {sections.map((g) => {
        const open = needle || status ? true : !closed[g.id];
        return (
          <div key={g.id}>
            <GroupHead label={g.label} count={g.rows.length} open={Boolean(open)} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} />
            {open ? (
              <ul className={`grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 md:px-5 2xl:grid-cols-3${g.id === 'na' ? ' [&_a]:opacity-60' : ''}`}>
                {g.rows.map((r) => (
                  <li key={r.stepId} className="min-w-0">
                    <RegTileCard r={r} today={today} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="cp-compliances">
      <div className="cp-comp-root page" ref={root}>
        <Island className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SCard title="Registrations" meta={items.length ? active.length : undefined} right={head} flush>
            {list}
          </SCard>
          <div className="grid min-w-0 gap-5">
            <SCard title="Due in the next 15 days" flush>
              {!after ? (
                <Empty>After the certificate</Empty>
              ) : due.length ? (
                due.slice(0, 8).map((r) => {
                  const rel = relativeDue(today, r.due!);
                  return (
                    <GoLink
                      key={r.stepId}
                      href={registrationHref(r.id)}
                      label={`${r.name} · ${rel.label}`}
                      className={`flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[14px] text-ink first:border-t-0 hover:bg-surface-sunken md:px-5${rel.tone === 'bad' ? ' bg-danger-soft' : ''}`}
                    >
                      <DateTile iso={r.due!} s={urgencyTint(today, r.due!)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{r.name}</span>
                        <span className="block truncate text-[12.5px] text-ink-muted">{r.needs[0] ?? r.group}</span>
                      </span>
                      <Chip tone={rel.tone} fixed>
                        {rel.label}
                      </Chip>
                    </GoLink>
                  );
                })
              ) : (
                <Empty />
              )}
            </SCard>
            {renewals.length ? (
              <SCard title="Renewals" meta={renewals.length} flush>
                {renewals.slice(0, 8).map(({ r, renewal }) => (
                  <GoLink
                    key={r.stepId}
                    href={registrationHref(r.id)}
                    label={`${r.name} · ${renewal!.word}`}
                    className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[14px] text-ink first:border-t-0 hover:bg-surface-sunken md:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{r.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">Renew by {fmtDM(renewal!.renewBy)}</span>
                    </span>
                    <Chip tone={renewal!.word === 'Overdue' ? 'bad' : 'warn'} fixed>
                      {renewal!.word}
                    </Chip>
                  </GoLink>
                ))}
              </SCard>
            ) : null}
            <SCard title="Waiting on client" flush>
              {waiting.length ? (
                waiting.slice(0, 8).map((r) => (
                  <ListRow key={r.stepId}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">{r.needs.slice(0, 2).join(', ') || r.group}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => go(clientIncorporationStepPath(r.step.item))}>
                      Upload
                    </Button>
                  </ListRow>
                ))
              ) : (
                <Empty />
              )}
            </SCard>
            <SCard title="Progress flow">
              <StackedBar
                onPick={(k) => setStatus((cur) => (cur === k ? null : (k as RegStatus)))}
                segments={REG_ORDER.map((s) => ({ key: s, label: regWord(s), value: count(s), fill: REG_FILL[s] }))}
              />
            </SCard>
          </div>
        </Island>
      </div>
    </div>
  );
}

/**
 * One registration as a tile (prototype RegisterGrid): a 1.5px card, the name with a chevron, the
 * area pill and the status chip, then the date line (red when late), the stored number in mono
 * and the renewal date once an expiry is stored.
 */
function RegTileCard({ r, today }: { r: RegItem; today: string }) {
  const renewal = renewalOf(r.facts, new Date(`${today}T00:00:00`));
  const date = regDate(r);
  const line = r.notNeeded ? 'Not needed' : r.status === 'Done' ? (date ? `Granted ${fmtDM(date)}` : 'Granted') : date ? `Due ${fmtDM(date)}` : r.needs[0] ?? r.group;
  return (
    <GoLink
      href={registrationHref(r.id)}
      label={`${r.name} · ${r.notNeeded ? 'Not needed' : regWord(r.status)}`}
      className="grid h-full min-w-0 gap-2 rounded-md border-1.5 border-line bg-surface-raised px-3.5 py-3 text-ink hover:border-line-strong hover:bg-surface-sunken"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.name}</span>
        <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden />
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <WordPill word={r.area} />
        <RegChip r={r} />
      </span>
      <span className="truncate text-[12.5px] text-ink-muted">
        <span className={r.late && r.status !== 'Done' && !r.notNeeded ? 'font-medium text-danger' : undefined}>{line}</span>
        {r.number ? <span className="font-mono text-ink-2">{` · ${r.number}`}</span> : null}
        {renewal ? (
          <span className={renewal.word === 'Overdue' ? 'font-medium text-danger' : renewal.word ? 'font-medium text-warning' : undefined}>
            {` · Renew by ${fmtDM(renewal.renewBy)}${renewal.word ? ` · ${renewal.word}` : ''}`}
          </span>
        ) : null}
      </span>
    </GoLink>
  );
}
