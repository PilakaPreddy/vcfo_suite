import toast from 'react-hot-toast';
import { getToastVariantStyle } from '@/lib/toast-style';
import { infoToastIcon, warningToastIcon } from '@/components/ui/hot-toast';
import {
  emailDispatchNotice,
  emailDispatchToastId,
  type EmailDispatchResult,
  type EmailDispatchToastMeta,
} from '@/lib/email/email-dispatch';

const ERROR_DURATION_MS = 6000;
const SUCCESS_DURATION_MS = 4500;
const WARNING_DURATION_MS = 5500;

const NETWORK_MESSAGE =
  'No internet connection. Check your network and try again.';

interface ApiErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  error?: string;
}

export class AppApiError extends Error {
  readonly code?: string;
  readonly kind: 'network' | 'database' | 'auth' | 'validation' | 'server' | 'unknown';

  constructor(
    message: string,
    options?: {
      code?: string;
      kind?: AppApiError['kind'];
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'AppApiError';
    this.code = options?.code;
    this.kind = options?.kind ?? 'unknown';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

const CODE_MESSAGES: Record<string, string> = {
  '42703': 'Database setup incomplete — contact support.',
  '42P01': 'Database setup incomplete — contact support.',
  '23505': 'That record already exists.',
  '23503': 'This item is linked to other data and cannot be removed.',
  '42501': 'You do not have permission for this action.',
  invalid_credentials: 'Invalid email or password.',
  user_not_found: 'No account found for that email.',
  email_not_confirmed: 'Confirm your email before signing in.',
  intern_required: 'Assign at least one project lead.',
  invalid_email: 'Use a valid work email.',
  company_required: 'Enter the project or GCC entity name.',
  parent_entity_name_required: 'Enter the parent entity’s full legal name.',
  parent_entity_address_required: 'Enter the parent entity’s registered address.',
  subsidiary_legal_name_required: 'Enter the subsidiary company’s legal name.',
  subsidiary_registered_address_required: 'Enter the subsidiary company’s registered address.',
  email_already_registered: 'That email already has an account. Use a different client email.',
  invalid_body: 'Check the required fields and try again.',
  invalid_json: 'The request was not valid JSON. Try again.',
  // Board meetings (src/db/repositories/board-meetings): the repository throws short codes (UAT D-T11-01).
  bad_date: 'Enter a valid date.',
  bad_time: 'Enter a valid time.',
  bad_din: 'A DIN has 8 digits.',
  bad_email: 'Enter a valid email address.',
  bad_link: 'The Teams link must be a full web address starting with https://.',
  bad_mode: 'Choose how the meeting is held.',
  bad_type: 'Choose the type of meeting.',
  bad_signatory: 'Pick a director on this meeting to sign the notice.',
  bad_signer: 'Pick a director to sign.',
  blank_fields: 'Fill the blanks in the notice first.',
  held_in_future: 'A meeting dated in the future cannot be recorded as held.',
  no_director_email: 'Add at least one director with an email address to the notice.',
  venue_required: 'Enter the venue.',
  note_required: 'Write a short note.',
  name_required: 'Enter a name.',
  title_required: 'Enter a title.',
  description_required: 'Enter a description.',
  wording_required: 'Enter the wording of the resolution.',
  signers_required: 'Pick who signs.',
  not_resolution: 'That item is not a resolution.',
  pdf_only: 'Upload a PDF file.',
  empty_file: 'The file is empty.',
  no_file: 'Choose a file to upload.',
  too_large: 'The file is too large.',
};

function looksLikeDatabaseMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('42703') ||
    lower.includes('42p01') ||
    lower.includes('does not exist') ||
    lower.includes('duplicate key') ||
    lower.includes('23505') ||
    lower.includes('violates foreign key') ||
    lower.includes('permission denied')
  );
}

function readMessage(err: unknown): string | undefined {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'object' && err !== null) {
    const record = err as ApiErrorLike;
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  }
  return undefined;
}

function readCode(err: unknown): string | undefined {
  if (err instanceof AppApiError && err.code) return err.code;
  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code?: string }).code;
    if (typeof code === 'string' && code.trim()) return code.trim();
  }
  if (typeof err === 'object' && err !== null) {
    const code = (err as ApiErrorLike).code;
    if (typeof code === 'string' && code.trim()) return code.trim();
  }
  return undefined;
}

/** True only for genuine transport / offline failures — not API or database errors. */
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof AppApiError && err.kind === 'network') return true;

  if (err instanceof TypeError) {
    const lower = err.message.toLowerCase();
    return (
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('network request failed') ||
      lower.includes('load failed')
    );
  }

  const message = readMessage(err)?.toLowerCase() ?? '';
  if (!message) return false;
  if (looksLikeDatabaseMessage(message)) return false;

  return (
    message === 'failed to fetch' ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('err_internet_disconnected') ||
    message.includes('err_network_changed')
  );
}

function mapApiError(
  code: string | undefined,
  rawMessage: string,
): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (CODE_MESSAGES[rawMessage]) return CODE_MESSAGES[rawMessage];

  const lower = rawMessage.toLowerCase();
  if (lower.includes('managerid is required')) {
    return 'Assign at least one project manager.';
  }
  if (lower.includes('invalid internid')) {
    return 'Select a valid project lead from the team list.';
  }
  if (lower.includes('column') && lower.includes('does not exist')) {
    return CODE_MESSAGES['42703'];
  }
  if (lower.includes('relation') && lower.includes('does not exist')) {
    return CODE_MESSAGES['42P01'];
  }
  if (lower.includes('duplicate key') || lower.includes('23505')) {
    return CODE_MESSAGES['23505'];
  }
  if (lower.includes('permission denied') || lower.includes('42501')) {
    return CODE_MESSAGES['42501'];
  }
  if (lower.includes('jwt') || lower.includes('session') || lower.includes('not authenticated')) {
    return 'Session expired — sign in again.';
  }

  return rawMessage;
}

/** Extract a user-facing message from unknown thrown values. */
export function errorMessage(err: unknown, fallback = 'Try again in a moment.'): string {
  if (isNetworkError(err)) return NETWORK_MESSAGE;

  const raw = readMessage(err);
  if (!raw) return fallback;

  return mapApiError(readCode(err), raw);
}

function toastMessage(title: string, description?: string): string {
  if (!description) return title;
  return `${title} — ${description}`;
}

export function toastError(title: string, description?: string, options?: { id?: string }) {
  toast.error(toastMessage(title, description), {
    duration: ERROR_DURATION_MS,
    ...(options?.id ? { id: options.id } : {}),
  });
}

/** A spinner toast that stays until a later toast with the same id replaces it. */
export function toastLoading(title: string, description: string | undefined, options: { id: string }) {
  toast.loading(toastMessage(title, description), { id: options.id });
}

export function toastSuccess(
  title: string,
  description?: string,
  options?: { id?: string },
) {
  toast.success(toastMessage(title, description), {
    duration: SUCCESS_DURATION_MS,
    ...(options?.id ? { id: options.id } : {}),
  });
}

function toastWarning(title: string, description?: string, options?: { id?: string }) {
  toast(toastMessage(title, description), {
    duration: WARNING_DURATION_MS,
    icon: warningToastIcon(),
    style: getToastVariantStyle('warning'),
    ...(options?.id ? { id: options.id } : {}),
  });
}

export function toastInfo(title: string, description?: string, options?: { id?: string }) {
  toast(toastMessage(title, description), {
    duration: SUCCESS_DURATION_MS,
    icon: infoToastIcon(),
    style: getToastVariantStyle('info'),
    ...(options?.id ? { id: options.id } : {}),
  });
}

export const EMAIL_DISPATCH_NOTIFICATIONS_EVENT = 'vcfo:notifications-refresh';
export const COMPOSE_OUTGOING_EMAIL_EVENT = 'vcfo:compose-outgoing-email';

export type { EmailDispatchToastMeta };

function persistEmailDispatchNotification(
  draft: NonNullable<ReturnType<typeof emailDispatchNotice>>,
) {
  if (typeof window === 'undefined') return;
  void fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification: draft }),
  })
    .catch(() => {
      /* toast already shown; bell will catch up on next poll */
    })
    .finally(() => {
      window.dispatchEvent(new CustomEvent(EMAIL_DISPATCH_NOTIFICATIONS_EVENT));
    });
}

/**
 * Toast after an API action that dispatched email(s), and add a matching
 * row to the notifications bell. Lead → client drafts open the compose modal.
 */
export function toastEmailDispatch(
  email: EmailDispatchResult | null | undefined,
  meta?: EmailDispatchToastMeta,
) {
  if (email?.outgoingDraft && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COMPOSE_OUTGOING_EMAIL_EVENT, { detail: email.outgoingDraft }),
    );
  }

  if (!email || email.attempted === 0) return;

  const draft = emailDispatchNotice(email, meta);
  if (!draft) return;

  const toastId = emailDispatchToastId(draft, meta);
  if (draft.kind === 'email.sent') {
    toastSuccess(draft.title, draft.body, { id: toastId });
  } else {
    toastWarning(draft.title, draft.body, { id: toastId });
  }

  persistEmailDispatchNotification(draft);
}

export { toast };
