'use client';

import { sep } from '@/lib/date-format';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { AreaPill, Chip, Tag } from '@/components/ui/spectrum-chip';
import { type Regulator } from '@/lib/ui/regulator';
import {
  ANNOUNCEMENT_KIND_LABEL,
  ANNOUNCEMENT_KINDS,
  announcementAuthorName,
  announcementMatchesFilter,
  parseAnnouncementKind,
  type Announcement,
  type AnnouncementKind,
} from '@/lib/notifications/announcements';
import { cn } from '@/lib/utils';

export function formatAnnouncementWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 60_000) return 'Just now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return sep(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  } catch {
    return '';
  }
}

/** R-43: kinds that name a regulator show that regulator's swatch in the area pill. */
const KIND_REG: Partial<Record<AnnouncementKind, Regulator>> = {
  mca: 'mca',
  incorp: 'mca',
  'post-incorp': 'mca',
  reg: 'mca',
  gst: 'gst',
  tax: 'it',
};

/** Deadline and compliance notes are the "important" ones (see `announcementMatchesFilter`). */
export function announcementIsImportant(kind: string): boolean {
  return announcementMatchesFilter(parseAnnouncementKind(kind), 'important');
}

/**
 * R-13 and R-43: one 104px mark per row, so the titles line up. A deadline is a status chip;
 * every other kind is an area pill.
 */
export function AnnouncementKindChip({ kind }: { kind: string }) {
  const parsed = parseAnnouncementKind(kind);
  const label = ANNOUNCEMENT_KIND_LABEL[parsed];
  if (parsed === 'deadline') {
    return (
      <Chip fixed tone="warn">
        {label}
      </Chip>
    );
  }
  return <AreaPill area={label} reg={KIND_REG[parsed]} />;
}

/** 44px date tile (prototype AttentionList `DateTile`); deadlines are tinted amber. */
function AnnouncementDateTile({ iso, warn }: { iso: string; warn?: boolean }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <span
      className={cn(
        'grid w-11 flex-none place-items-center rounded-md border-1.5 py-1 leading-none',
        warn ? 'border-transparent bg-warning-soft text-warning' : 'border-line bg-surface-raised text-ink',
      )}
      aria-hidden
    >
      <b className="text-[16px] font-medium tabular-nums">{d.getDate()}</b>
      <span className={cn('text-[10.5px] font-medium uppercase tracking-wider', warn ? 'opacity-80' : 'text-ink-muted')}>
        {d.toLocaleDateString('en-GB', { month: 'short' })}
      </span>
    </span>
  );
}

/** R-10: the kind picker is a row of filter chips; the picked one has the soft blurple fill. */
export function AnnouncementKindPicker({
  value,
  onChange,
}: {
  value: AnnouncementKind;
  onChange: (kind: AnnouncementKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
      {ANNOUNCEMENT_KINDS.map((id) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex h-[28px] items-center rounded-md border-1.5 px-2.5 text-[13px] font-medium transition-colors',
              on
                ? 'border-brand-line bg-brand-soft text-brand-text'
                : 'border-line-strong bg-surface-raised text-ink-2 hover:bg-surface-sunken',
            )}
          >
            {ANNOUNCEMENT_KIND_LABEL[id]}
          </button>
        );
      })}
    </div>
  );
}

function sourceHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function AnnouncementRow({
  item,
  unread = false,
  compact,
  showSource,
  onActivate,
  trailing,
  className,
}: {
  item: Announcement;
  unread?: boolean;
  compact?: boolean;
  showSource?: boolean;
  onActivate?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const message = item.body.trim() || item.title;
  // The prototype leads with the title; the body follows on a muted line when it says more.
  const headline = item.title?.trim() || message;
  const sentBy = announcementAuthorName(item);
  const showExtraTitle = Boolean(item.title && item.body && item.title !== item.body && !compact);
  const includeSource = Boolean(showSource ?? !compact) && Boolean(item.sourceUrl);
  const host = includeSource ? sourceHost(item.sourceUrl) : null;
  const rowClass = cn(
    'flex w-full min-w-0 items-center gap-3 text-left',
    compact ? 'px-3.5 py-2.5' : 'min-h-[72px] px-4 py-3',
    onActivate && 'cursor-pointer hover:bg-surface-sunken',
    className,
  );

  const unreadDot = (
    <span
      className={cn('h-2 w-2 flex-none rounded-[2px]', unread ? 'bg-brand' : 'bg-transparent')}
      role={unread ? 'img' : undefined}
      aria-label={unread ? 'Unread' : undefined}
    />
  );

  const inner = compact ? (
    <>
      <AnnouncementKindChip kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-2 text-[13px] leading-snug', unread ? 'font-medium text-ink' : 'text-ink-2')}>
          {message}
        </p>
        <p className="mt-0.5 truncate text-[12px] leading-snug text-ink-muted">{item.unreviewed ? `Not yet reviewed · ${sentBy}` : sentBy}</p>
      </div>
      <time dateTime={item.publishedAt} className="shrink-0 self-center text-[12px] tabular-nums text-ink-muted">
        {formatAnnouncementWhen(item.publishedAt)}
      </time>
      {unreadDot}
      {trailing}
    </>
  ) : (
    <>
      <AnnouncementDateTile iso={item.publishedAt} warn={parseAnnouncementKind(item.kind) === 'deadline'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <AnnouncementKindChip kind={item.kind} />
          {item.unreviewed ? <Tag tone="warn">Not yet reviewed</Tag> : null}
          <span className="text-[12.5px] text-ink-muted">
            {item.origin === 'feed' ? 'Official feed' : `From ${sentBy}`}
            {/* A phone has no room for the host tag, so the host joins the by-line. */}
            {host ? <span className="sm:hidden"> · {host}</span> : null}
          </span>
        </p>
        <p className={cn('mt-1.5 truncate text-[14px]', unread ? 'font-medium text-ink' : 'text-ink-2')} title={headline}>
          {headline}
        </p>
        {showExtraTitle ? <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{item.body.trim()}</p> : null}
      </div>
      {host && item.sourceUrl ? (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-[1] hidden max-w-[40%] flex-none sm:inline-flex"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open source on ${host}`}
        >
          <Tag className="max-w-full gap-1 truncate hover:text-ink">
            {host}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Tag>
        </a>
      ) : null}
      {unreadDot}
      {trailing}
    </>
  );

  return (
    <div
      className={rowClass}
      data-unread={unread ? 'true' : 'false'}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      {inner}
    </div>
  );
}
