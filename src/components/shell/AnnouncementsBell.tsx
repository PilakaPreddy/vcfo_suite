"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { Megaphone, Plus, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnnouncements } from "@/hooks/use-announcements";
import {
  ANNOUNCEMENT_GENIE_LAND_EVENT,
  ANNOUNCEMENT_READ_EVENT,
  announcementMatchesFilter,
  canWriteAnnouncements,
  readAnnouncementIds,
  requestAnnouncementPopup,
  roleAnnouncementsPath,
  writeAnnouncementReadIds,
  type AnnouncementListFilter,
} from "@/lib/notifications/announcements";
import { AnnouncementComposeForm } from "@/components/announcements/AnnouncementCompose";
import { formatAnnouncementWhen } from "@/components/announcements/AnnouncementList";
import { Chip } from "@/components/ui/spectrum-chip";
import { cn } from "@/lib/utils";
import { SpectrumTabs } from "@/components/ui/spectrum-tabs";

const FILTER_TABS: Array<{ id: AnnouncementListFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "important", label: "Important" },
  { id: "general", label: "General" },
];

export function AnnouncementsBell() {
  const { user } = useApp();
  const list = useAnnouncements();
  const canWrite = canWriteAnnouncements(user?.role);
  const [readTick, setReadTick] = useState(0);
  const [filter, setFilter] = useState<AnnouncementListFilter>("all");
  const [catching, setCatching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const osReduce = useReducedMotion();

  useEffect(() => {
    const sync = () => setReadTick((n) => n + 1);
    window.addEventListener(ANNOUNCEMENT_READ_EVENT, sync);
    const land = () => {
      sync();
      setCatching(true);
      window.setTimeout(() => setCatching(false), 480);
    };
    window.addEventListener(ANNOUNCEMENT_GENIE_LAND_EVENT, land);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ANNOUNCEMENT_READ_EVENT, sync);
      window.removeEventListener(ANNOUNCEMENT_GENIE_LAND_EVENT, land);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const items = list.data?.announcements ?? [];
  const readIds = useMemo(
    () => (user?.id ? readAnnouncementIds(user.id) : new Set<string>()),
    [user?.id, items, readTick],
  );
  const unread = items.filter((item) => !readIds.has(item.id)).length;
  // The developer console has no Announcements page, so its menu has no "View all" link (prototype).
  const boardHref = user && user.role !== "developer" ? roleAnnouncementsPath(user.role) : null;
  const visible = useMemo(
    () => items.filter((item) => announcementMatchesFilter(item.kind, filter)).slice(0, 16),
    [items, filter],
  );

  const markOne = (id: string) => {
    if (!user?.id) return;
    const next = new Set(readIds);
    next.add(id);
    writeAnnouncementReadIds(user.id, next);
    setReadTick((n) => n + 1);
  };

  const openRow = (item: (typeof items)[number]) => {
    markOne(item.id);
    requestAnnouncementPopup(item);
    setMenuOpen(false);
  };

  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) setComposing(false);
      }}
    >
      <DropdownMenuTrigger
        data-announcements-bell=""
        className={cn(
          "relative flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 sm:min-h-9 sm:min-w-9",
          catching && "text-ink",
        )}
        aria-label={unread > 0 ? `Announcements, ${unread} unread` : "Announcements"}
      >
        {catching ? (
          <span className="pointer-events-none absolute inset-1 rounded-md bg-surface-sunken" aria-hidden />
        ) : null}
        <m.span
          data-announcements-bell-target=""
          className="relative inline-flex"
          animate={catching && !osReduce ? { scale: [1, 1.38, 0.94, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Megaphone className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
        </m.span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex w-[min(100vw-1.5rem,360px)] max-h-[min(82vh,640px)] flex-col overflow-hidden rounded-md border-1.5 border-line bg-surface-raised p-0 text-ink shadow-float"
      >
        {/* Prototype StaffAnnouncementsBell: the title with All, Important and General at the right. */}
        <div className="flex h-[52px] flex-none items-center gap-2 border-b border-line-soft px-4">
          <p className="text-[15px] font-medium leading-tight text-ink">Announcements</p>
          <SpectrumTabs
            className="ml-auto"
            label="Filter announcements"
            items={FILTER_TABS.map((tab) => ({ key: tab.id, label: tab.label }))}
            value={filter}
            onChange={(next) => setFilter(next as AnnouncementListFilter)}
          />
        </div>

        {canWrite ? (
          <div className="flex-none border-b border-line-soft px-4 py-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-text hover:underline"
              aria-expanded={composing}
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setComposing((open) => !open);
              }}
            >
              {composing ? (
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              )}
              {composing ? "Close" : "New announcement"}
            </button>
          </div>
        ) : null}

        {composing && canWrite ? (
          <AnnouncementComposeForm
            compact
            idPrefix="bell-ann"
            onClose={() => setComposing(false)}
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-faint">None</p>
          ) : (
            <ul>
              {visible.map((item) => {
                const isUnread = !readIds.has(item.id);
                const important = announcementMatchesFilter(item.kind, "important");
                const message = item.body.trim() || item.title;
                return (
                  <li key={item.id} className="border-t border-line-soft first:border-t-0">
                    <button
                      type="button"
                      onClick={() => openRow(item)}
                      data-unread={isUnread ? "true" : "false"}
                      className={cn(
                        "grid w-full gap-1 px-4 py-2.5 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
                        isUnread && "bg-surface-sunken",
                      )}
                    >
                      {important ? (
                        <Chip tone="bad" raw className="w-fit min-w-0">
                          Important
                        </Chip>
                      ) : null}
                      <b className={cn("line-clamp-2 text-[13px] text-ink", isUnread ? "font-semibold" : "font-medium")}>
                        {message}
                      </b>
                      <time dateTime={item.publishedAt} className="text-[12px] text-ink-muted">
                        {formatAnnouncementWhen(item.publishedAt)}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {boardHref ? (
          <div className="flex flex-none items-center border-t border-line-soft px-4 py-2.5">
            <Link
              href={boardHref}
              className="mr-auto text-[13px] font-medium text-brand-text hover:underline"
              onClick={() => setMenuOpen(false)}
            >
              View all announcements ›
            </Link>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
