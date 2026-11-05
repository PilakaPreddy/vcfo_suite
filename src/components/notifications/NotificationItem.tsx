"use client";

import Link from "next/link";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type { AppNotification } from "@/lib/checklist/checklist-notifications";
import {
  formatNotificationWhen,
  notificationHrefIsNavigable,
} from "@/lib/notifications/notification-dismiss";
import { NotificationKindTile } from "@/components/notifications/notification-kind";
import { cn } from "@/lib/utils";

function isOutboundKind(kind: AppNotification["kind"]): boolean {
  return kind === "email.sent" || kind === "email.skipped" || kind === "email.failed";
}

/**
 * The grey line under the title (prototype StaffBellMenu): the client, then the context. For an
 * outbound email the body is the recipient line, so it is the context; for the rest the body is.
 */
function notificationContextLine(item: AppNotification): string {
  const context = item.body?.trim() || null;
  return [item.companyName || null, context].filter(Boolean).join(" · ");
}

/**
 * One row of the staff notifications menu (VCFO Spectrum, prototype `StaffNotificationsBell`):
 * a 28px tinted tile for the kind, the 13px title, the client and context line, and the time at
 * the right. Unread rows are tinted. The clear button (a real action the prototype lacks) sits after
 * the time. An expanded sent
 * row shows its whole body and the Open link.
 */
export function NotificationItem({
  item,
  expanded,
  onOpen,
  onDismiss,
  showOpenLink,
  exiting,
}: {
  item: AppNotification;
  expanded?: boolean;
  onOpen: () => void;
  onDismiss?: () => void;
  showOpenLink?: boolean;
  exiting?: boolean;
}) {
  const outbound = isOutboundKind(item.kind);
  const fresh = !item.read;
  const context = notificationContextLine(item);
  const when = formatNotificationWhen(item.createdAt);
  const canOpen = showOpenLink && notificationHrefIsNavigable(item.href);
  const dismissed = Boolean(item.dismissedAt);

  return (
    <div
      className={cn(
        "flex min-w-0 border-t border-line-soft first:border-t-0",
        fresh && "bg-surface-sunken",
        exiting && "pointer-events-none",
      )}
      data-unread={fresh ? "true" : "false"}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full min-w-0 items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
        >
          <NotificationKindTile kind={item.kind} size={28} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <b className={cn("block min-w-0 truncate text-[13px] text-ink", fresh ? "font-semibold" : "font-medium")}>
                {item.title}
              </b>
              {dismissed ? (
                <span className="shrink-0 text-[11px] font-medium text-ink-faint">Cleared</span>
              ) : null}
            </span>
            {context ? (
              <span
                className={cn(
                  "block text-[12px] leading-snug text-ink-muted",
                  expanded && outbound ? "whitespace-pre-wrap break-words" : "truncate",
                )}
              >
                {context}
              </span>
            ) : null}
          </span>
          {when ? (
            <span className="flex-none text-[11.5px] text-ink-muted">
              {when}
            </span>
          ) : null}
        </button>
        {expanded && canOpen ? (
          <Link
            href={item.href}
            className="mb-2 ml-[56px] inline-flex items-center gap-0.5 text-[12px] font-medium text-brand-text hover:underline"
          >
            Open
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="mr-2 mt-2 inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-faint hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label={`Clear from inbox: ${item.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
