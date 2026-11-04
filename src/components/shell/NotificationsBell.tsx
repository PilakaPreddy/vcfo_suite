"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getToastVariantStyle } from "@/lib/toast-style";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import {
  notificationDirection,
  notificationsInDirection,
  type AppNotification,
  type NotificationDirection,
} from "@/lib/checklist/checklist-notifications";
import {
  NOTIFICATION_ROW_EXIT_MS,
  NOTIFICATION_ROW_EXIT_STAGGER_MS,
  NOTIFICATION_UNDO_TOAST_MS,
  mergeNotificationsByCreatedAt,
  notificationsMatchingClearScope,
  type NotificationClearScope,
} from "@/lib/notifications/notification-dismiss";
import { roleNotificationsPath } from "@/lib/auth-routes";
import {
  NOTIFICATION_GENIE_LAND_EVENT,
  requestNotificationPopup,
} from "@/lib/notifications/notification-popup";
import { toast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";
import { SpectrumTabs } from "@/components/ui/spectrum-tabs";

const FILTERS: Array<{ id: NotificationDirection; label: string }> = [
  { id: "received", label: "Received" },
  { id: "sent", label: "Sent" },
];

const UNDO_TOAST_ID = "notification-undo";

/** The footer links of the menu (prototype StaffBellMenu `FOOT`). */
const FOOT = "text-[13px] font-medium text-brand-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function offerUndoToast(message: string, onUndo: () => void) {
  toast.custom(
    (t) => (
      <div
        data-notification-undo-toast=""
        role="status"
        className="flex items-center gap-3"
        style={{
          ...getToastVariantStyle("default"),
          padding: "8px 12px",
          maxWidth: "280px",
        }}
      >
        <span className="min-w-0 text-[12px] leading-snug text-ink">{message}</span>
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
          onClick={() => {
            onUndo();
            toast.dismiss(t.id);
          }}
        >
          Undo
        </button>
      </div>
    ),
    {
      id: UNDO_TOAST_ID,
      duration: NOTIFICATION_UNDO_TOAST_MS,
      position: "top-right",
    },
  );
}

function clearCopy(scope: NotificationClearScope, count: number, filter: NotificationDirection): string {
  if (count === 1) return "Notification cleared";
  if (scope === "today") return `Cleared ${count} from today`;
  if (scope === "week") return `Cleared ${count} from this week`;
  return `Cleared ${count} ${filter} notifications`;
}

export function NotificationsBell() {
  const {
    user,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotifications,
    restoreNotifications,
  } = useApp();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationDirection>("received");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [exitingRows, setExitingRows] = useState<AppNotification[]>([]);
  const [exitDelayMsById, setExitDelayMsById] = useState<Record<string, number>>({});
  const [catching, setCatching] = useState(false);
  const exitTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const osReduce = useReducedMotion();

  useEffect(() => {
    const land = () => {
      setCatching(true);
      window.setTimeout(() => setCatching(false), 480);
    };
    window.addEventListener(NOTIFICATION_GENIE_LAND_EVENT, land);
    return () => window.removeEventListener(NOTIFICATION_GENIE_LAND_EVENT, land);
  }, []);

  const historyHref = user ? roleNotificationsPath(user.role) : "/";

  const counts = useMemo(() => {
    let received = 0;
    let sent = 0;
    let receivedUnread = 0;
    let sentUnread = 0;
    for (const n of notifications) {
      if (notificationDirection(n.kind) === "sent") {
        sent += 1;
        if (!n.read) sentUnread += 1;
      } else {
        received += 1;
        if (!n.read) receivedUnread += 1;
      }
    }
    return { received, sent, receivedUnread, sentUnread };
  }, [notifications]);

  const tabItems = useMemo(
    () => notificationsInDirection(notifications, filter),
    [notifications, filter],
  );

  const filtered = useMemo(() => {
    const ghosts = exitingRows.filter((n) => notificationDirection(n.kind) === filter);
    return mergeNotificationsByCreatedAt(tabItems, ghosts).slice(0, 16);
  }, [tabItems, exitingRows, filter]);

  const tabCount = filter === "sent" ? counts.sent : counts.received;
  const hasUnread = unreadNotificationCount > 0;

  const now = useMemo(() => new Date(), [notifications, filter, open]);
  const todayCount = notificationsMatchingClearScope(tabItems, "today", now).length;
  const weekCount = notificationsMatchingClearScope(tabItems, "week", now).length;

  const finishExit = (items: AppNotification[]) => {
    const ids = new Set(items.map((n) => n.id));
    for (const id of ids) {
      const timer = exitTimersRef.current.get(id);
      if (timer !== undefined) clearTimeout(timer);
      exitTimersRef.current.delete(id);
    }
    setExitingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setExitingRows((prev) => prev.filter((n) => !ids.has(n.id)));
    setExitDelayMsById((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        delete next[id];
      });
      return next;
    });
  };

  const scheduleFinishExit = (items: AppNotification[], staggerMs: number) => {
    const reduced = prefersReducedMotion();
    items.forEach((item, index) => {
      const prev = exitTimersRef.current.get(item.id);
      if (prev !== undefined) clearTimeout(prev);
      const delay = reduced ? 0 : NOTIFICATION_ROW_EXIT_MS + index * staggerMs;
      const timer = setTimeout(() => {
        exitTimersRef.current.delete(item.id);
        setExitingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setExitingRows((rows) => rows.filter((n) => n.id !== item.id));
        setExitDelayMsById((current) => {
          if (!(item.id in current)) return current;
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }, delay);
      exitTimersRef.current.set(item.id, timer);
    });
  };

  const cancelExit = (items: AppNotification[]) => {
    finishExit(items);
    restoreNotifications(items);
  };

  const dismissWithUndo = (items: AppNotification[], message: string) => {
    if (items.length === 0) return;
    const reduced = prefersReducedMotion();
    const staggerMs = reduced || items.length === 1 ? 0 : NOTIFICATION_ROW_EXIT_STAGGER_MS;

    if (reduced) {
      dismissNotifications(items);
      offerUndoToast(message, () => restoreNotifications(items));
      return;
    }

    setExitingIds((prev) => {
      const next = new Set(prev);
      items.forEach((n) => next.add(n.id));
      return next;
    });
    setExitingRows((prev) => mergeNotificationsByCreatedAt(prev, items));
    setExitDelayMsById((prev) => {
      const next = { ...prev };
      items.forEach((n, index) => {
        next[n.id] = index * staggerMs;
      });
      return next;
    });
    dismissNotifications(items);
    offerUndoToast(message, () => cancelExit(items));
    scheduleFinishExit(items, staggerMs);
  };

  const handleDeleteOne = (item: AppNotification) => {
    dismissWithUndo([item], "Notification cleared");
  };

  const handleClearScope = (scope: NotificationClearScope) => {
    const batch = notificationsMatchingClearScope(
      mergeNotificationsByCreatedAt(
        tabItems,
        exitingRows.filter((n) => notificationDirection(n.kind) === filter),
      ),
      scope,
      new Date(),
    );
    dismissWithUndo(batch, clearCopy(scope, batch.length, filter));
  };

  const guardOutside = (event: { target: EventTarget | null; preventDefault: () => void }) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-notification-undo-toast]")) {
      event.preventDefault();
    }
  };

  // F-329: the developer console has no notifications page and gets no bell notifications, so
  // the developer has only the Announcements bell (prototype). Super admin keeps both: it has a
  // real notification history page.
  if (user?.role === "developer") return null;

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelectedId(null);
      }}
    >
      <PopoverTrigger
        data-notifications-bell=""
        className={cn(
          "relative flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 sm:min-h-9 sm:min-w-9",
          catching && "text-ink",
        )}
        aria-label={
          hasUnread
            ? `View notifications, ${unreadNotificationCount} unread`
            : "View notifications"
        }
      >
        {catching ? (
          <span className="pointer-events-none absolute inset-1 rounded-md bg-surface-sunken" aria-hidden />
        ) : null}
        <m.span
          data-notifications-bell-target=""
          className="relative inline-flex"
          animate={catching && !osReduce ? { scale: [1, 1.38, 0.94, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Bell className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
        </m.span>
        {hasUnread && (
          <span
            className="absolute right-[5px] top-[5px] flex h-4 min-w-4 items-center justify-center rounded-sm bg-danger-mid px-1 text-[10.5px] font-medium leading-none text-white ring-2 ring-surface-raised"
            aria-hidden
          >
            {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-[min(100vw-1.5rem,380px)] max-h-[min(74vh,520px)] flex-col overflow-hidden rounded-md border-1.5 border-line bg-surface-raised p-0 text-ink shadow-float"
        onPointerDownOutside={guardOutside}
        onInteractOutside={guardOutside}
      >
        {/* Prototype StaffNotificationsBell: the title with Received and Sent at the right. */}
        <div className="flex h-[52px] flex-none items-center gap-2 border-b border-line-soft px-4">
          <p className="text-[15px] font-medium leading-tight text-ink">Notifications</p>
          <SpectrumTabs
            className="ml-auto"
            label="Filter notifications"
            items={FILTERS.map((tab) => {
              const unread = tab.id === "sent" ? counts.sentUnread : counts.receivedUnread;
              return { key: tab.id, label: tab.label, count: unread > 0 ? unread : undefined };
            })}
            value={filter}
            onChange={(next) => setFilter(next as NotificationDirection)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-faint">None</p>
          ) : (
            filtered.map((n) => {
              const exiting = exitingIds.has(n.id);
              const exitDelayMs = exiting ? (exitDelayMsById[n.id] ?? 0) : 0;

              return (
                <div
                  key={n.id}
                  className={cn(
                    "transition-[transform,opacity] ease motion-reduce:transition-none",
                    exiting
                      ? "translate-x-full opacity-0"
                      : "translate-x-0 opacity-100",
                  )}
                  style={{
                    transitionDuration: `${NOTIFICATION_ROW_EXIT_MS}ms`,
                    transitionDelay: `${exitDelayMs}ms`,
                  }}
                >
                  <NotificationItem
                    item={n}
                    expanded={selectedId === n.id}
                    exiting={exiting}
                    showOpenLink
                    onOpen={() => {
                      markNotificationRead(n.id);
                      if (notificationDirection(n.kind) === "received") {
                        requestNotificationPopup(n);
                        setOpen(false);
                        return;
                      }
                      setSelectedId((current) => (current === n.id ? null : n.id));
                    }}
                    onDismiss={() => handleDeleteOne(n)}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer row of 13px blurple links (prototype). A clear link shows only when it has rows to clear. */}
        <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2.5">
          {hasUnread ? (
            <button type="button" className={FOOT} onClick={() => markAllNotificationsRead()}>
              Mark all read
            </button>
          ) : null}
          {todayCount > 0 ? (
            <button type="button" className={FOOT} onClick={() => handleClearScope("today")}>
              Clear today
            </button>
          ) : null}
          {weekCount > 0 ? (
            <button type="button" className={FOOT} onClick={() => handleClearScope("week")}>
              Clear this week
            </button>
          ) : null}
          {tabCount > 0 ? (
            <button
              type="button"
              className={FOOT}
              aria-label={`Clear all ${filter} notifications`}
              onClick={() => handleClearScope("all")}
            >
              Clear all
            </button>
          ) : null}
          <Link href={historyHref} className={cn(FOOT, "ml-auto")} onClick={() => setOpen(false)}>
            Notification history ›
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
