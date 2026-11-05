import type { NotificationKind } from '@/lib/checklist/checklist-notifications';
/**
 * Shared email-dispatch summary (safe for client + server).
 * API routes include this on responses so the UI can toast.
 */

/** Lead → client compose payload (sent via Graph Mail.Send after in-app edit). */
export type OutgoingEmailDraft = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  engagementId?: string;
  companyName?: string;
  itemId?: string;
};

export type EmailDispatchToastMeta = {
  engagementId?: string;
  companyName?: string;
  itemId?: string;
  href?: string;
};

export type EmailDispatchResult = {
  attempted: number;
  /** Addresses that the provider accepted. */
  sent: string[];
  /** Addresses skipped because email is not configured. */
  skipped: string[];
  /** Addresses that failed to send. */
  failed: string[];
  /** Subjects of outbound messages (for Sent tab / toasts). */
  subjects?: string[];
  /** Last provider error (safe to show in a toast). */
  error?: string;
  /** When set, UI should open compose instead of auto-sending to clients. */
  outgoingDraft?: OutgoingEmailDraft;
};

export function emptyEmailDispatch(): EmailDispatchResult {
  return { attempted: 0, sent: [], skipped: [], failed: [], subjects: [] };
}

export function formatEmailRecipients(emails: string[]): string {
  const unique = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]} and ${unique.length - 1} others`;
}

export function pushEmailSubject(
  email: EmailDispatchResult,
  subject: string | null | undefined,
): void {
  const s = subject?.trim();
  if (!s) return;
  if (!email.subjects) email.subjects = [];
  if (!email.subjects.includes(s)) email.subjects.push(s);
}

/** Stable react-hot-toast id so retries replace instead of stacking. */
export function emailDispatchToastId(
  draft: { kind: string; title: string },
  meta?: { engagementId?: string; itemId?: string },
): string {
  return ['email-dispatch', draft.kind, meta?.engagementId, meta?.itemId, draft.title]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(':');
}

/** The bell row (and toast text) that tells the sender how a dispatch went; null when nothing was tried. */
export function emailDispatchNotice(
  email: EmailDispatchResult,
  meta?: EmailDispatchToastMeta,
): {
  kind: NotificationKind;
  title: string;
  body: string;
  engagementId: string;
  companyName: string;
  itemId?: string;
  href: string;
} | null {
  if (email.attempted === 0) return null;

  const subjects = [...new Set((email.subjects ?? []).map((s) => s.trim()).filter(Boolean))];
  const subjectLine =
    subjects.length === 0
      ? null
      : subjects.length === 1
        ? subjects[0]
        : `${subjects[0]} (+${subjects.length - 1} more)`;

  if (email.sent.length > 0) {
    return {
      kind: 'email.sent',
      title: subjectLine ?? 'Email sent',
      body: subjectLine
        ? `To ${formatEmailRecipients(email.sent)}`
        : formatEmailRecipients(email.sent),
      engagementId: meta?.engagementId ?? '',
      companyName: meta?.companyName ?? '',
      itemId: meta?.itemId,
      href: meta?.href ?? '#',
    };
  }
  if (email.skipped.length > 0) {
    return {
      kind: 'email.skipped',
      title: subjectLine ?? 'Email not configured',
      body: subjectLine
        ? `Not sent to ${formatEmailRecipients(email.skipped)} — email provider not configured.`
        : `Would send to ${formatEmailRecipients(email.skipped)}. Set EMAIL_PROVIDER and From (EMAIL_FROM / RESEND_FROM_EMAIL) — plus RESEND_API_KEY for Resend, or SES identity for SES.`,
      engagementId: meta?.engagementId ?? '',
      companyName: meta?.companyName ?? '',
      itemId: meta?.itemId,
      href: meta?.href ?? '#',
    };
  }
  if (email.failed.length > 0) {
    return {
      kind: 'email.failed',
      title: subjectLine ?? "Email didn't send",
      body: subjectLine
        ? `Failed for ${formatEmailRecipients(email.failed)}${email.error ? ` — ${email.error}` : ''}`
        : `Could not deliver to ${formatEmailRecipients(email.failed)}${email.error ? ` — ${email.error}` : ''}`,
      engagementId: meta?.engagementId ?? '',
      companyName: meta?.companyName ?? '',
      itemId: meta?.itemId,
      href: meta?.href ?? '#',
    };
  }
  return null;
}
