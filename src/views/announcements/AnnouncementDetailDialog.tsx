'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tag } from '@/components/ui/spectrum-chip';
import { UserFace } from '@/components/common/UserFace';
import { AnnouncementKindChip, announcementIsImportant } from '@/components/announcements/AnnouncementList';
import { ROLE_UI_LABEL, type Role } from '@/lib/auth';
import { announcementAuthorName, parseAnnouncementKind, type Announcement } from '@/lib/notifications/announcements';

/*
 * Announcement detail (prototype AnnouncementsScreen modal): the title is the dialog heading,
 * then the kind chip, an "Important" tag and the date and time. The sender row shows the
 * author's initials, name and role, or the feed host for a feed item. The footer steps through
 * the list the page shows ("3 / 8", previous and next, arrow keys), opens the source and closes
 * with "Got it". Contact buttons are left out: announcements store no author email or phone.
 */

function whenLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function AnnouncementDetailDialog({
  items,
  currentId,
  onGo,
  onClose,
}: {
  items: Announcement[];
  currentId: string | null;
  onGo: (item: Announcement) => void;
  onClose: () => void;
}) {
  const pos = currentId ? items.findIndex((x) => x.id === currentId) : -1;
  const item = pos >= 0 ? items[pos] : null;
  const prev = pos > 0 ? items[pos - 1] : null;
  const next = pos >= 0 && pos < items.length - 1 ? items[pos + 1] : null;

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prev) onGo(prev);
      else if (e.key === 'ArrowRight' && next) onGo(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, prev, next, onGo]);

  const host = item ? hostOf(item.sourceUrl) : null;
  const feed = item?.origin === 'feed';
  const name = item ? announcementAuthorName(item) : '';
  const body = item ? item.body.trim() : '';
  const title = item ? item.title.trim() || body : '';

  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent size="md">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <AnnouncementKindChip kind={item.kind} />
                {announcementIsImportant(item.kind) && parseAnnouncementKind(item.kind) !== 'deadline' ? <Tag tone="bad">Important</Tag> : null}
                {item.unreviewed ? <Tag tone="warn">Not yet reviewed</Tag> : null}
                <time dateTime={item.publishedAt} className="text-[12.5px] tabular-nums text-ink-muted">
                  {whenLine(item.publishedAt)}
                </time>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {body && body !== title ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{body}</p> : null}
              <div className="flex items-center gap-3 border-t border-line-soft pt-3">
                {feed ? (
                  <span className="text-[13px] text-ink-muted">Official feed{item.sourceName ? ` · ${item.sourceName}` : ''}</span>
                ) : (
                  <>
                    <UserFace initials={initialsOf(name)} toneFrom={item.authorId ?? name} className="h-9 w-9 text-[13px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">
                        {[item.authorRole ? ROLE_UI_LABEL[item.authorRole as Role] ?? item.authorRole : null, whenLine(item.publishedAt)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </>
                )}
                {feed && host && item.sourceUrl ? (
                  <Button asChild size="sm" variant="secondary" className="ml-auto">
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {host} <ExternalLink aria-hidden />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter className="justify-between">
              <span className="flex items-center gap-1.5">
                <Button type="button" size="iconSm" variant="secondary" aria-label="Previous announcement" disabled={!prev} onClick={() => prev && onGo(prev)}>
                  <ChevronLeft aria-hidden />
                </Button>
                <span className="min-w-[44px] text-center text-[12.5px] tabular-nums text-ink-muted">
                  {pos + 1} / {items.length}
                </span>
                <Button type="button" size="iconSm" variant="secondary" aria-label="Next announcement" disabled={!next} onClick={() => next && onGo(next)}>
                  <ChevronRight aria-hidden />
                </Button>
              </span>
              <span className="flex items-center gap-2">
                {!feed && item.sourceUrl ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink aria-hidden />
                    </a>
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={onClose}>
                  Got it
                </Button>
              </span>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
