'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Saving a verdict, clearing one, and attaching what it rests on.
 *
 * The evidence upload is its own call and runs first: it returns a key, and the key goes into
 * the verdict. Doing both in one multipart write would mean a failed upload losing the text
 * somebody had just typed, and the text is the part that took the thought.
 */

export interface VerificationInput {
  formId: string;
  status: 'unverified' | 'disputed' | 'checked-against-sample' | 'gazette-verified';
  against?: string;
  disputedBecause?: string;
  openItems?: string[];
  suppressed?: boolean;
  suppressedReason?: string;
  /** Attached in this save, where one was chosen. */
  evidence?: File | null;
  /** Kept from the stored verdict when no new file is attached. */
  evidenceKey?: string | null;
  evidenceFileName?: string | null;
}

export interface VerificationActions {
  busy: string | null;
  error: string;
  save: (input: VerificationInput) => Promise<boolean>;
  clear: (formId: string) => Promise<void>;
}

export function useVerificationActions(): VerificationActions {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = useCallback(
    async (input: VerificationInput) => {
      setError('');
      setBusy(input.formId);
      try {
        let evidenceKey = input.evidenceKey ?? null;
        let evidenceFileName = input.evidenceFileName ?? null;

        if (input.evidence) {
          const body = new FormData();
          body.set('formId', input.formId);
          body.set('file', input.evidence);
          const res = await fetch('/api/labour-registers/verification/evidence', { method: 'POST', body });
          const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok) throw new Error(typeof answer.error === 'string' ? answer.error : 'The file could not be stored.');
          evidenceKey = String(answer.evidenceKey ?? '');
          evidenceFileName = String(answer.evidenceFileName ?? input.evidence.name);
        }

        const res = await fetch('/api/labour-registers/verification', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            formId: input.formId,
            status: input.status,
            against: input.against,
            disputedBecause: input.disputedBecause,
            openItems: input.openItems,
            suppressed: input.suppressed,
            suppressedReason: input.suppressedReason,
            evidenceKey,
            evidenceFileName,
          }),
        });
        const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw new Error(typeof answer.error === 'string' ? answer.error : 'That could not be recorded.');

        router.refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be recorded.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  const clear = useCallback(
    async (formId: string) => {
      setError('');
      setBusy(formId);
      try {
        const res = await fetch(`/api/labour-registers/verification?formId=${encodeURIComponent(formId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          throw new Error(typeof answer.error === 'string' ? answer.error : 'That could not be cleared.');
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be cleared.');
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  return { busy, error, save, clear };
}
