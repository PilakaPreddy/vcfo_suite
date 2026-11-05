'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Recording the signed printout.
 *
 * One call with the file in it, unlike the verification evidence which uploads separately. The
 * reason is what the file is: there, the attachment supports a judgement somebody typed and
 * the typing is the part worth protecting from a failed upload. Here the scan *is* the
 * attestation, so a half-succeeded version of it — a row saying signed, with nothing behind it
 * — must not be reachable at all.
 */
export interface AttestActions {
  busy: boolean;
  error: string;
  attest: (input: { documentId: string; file: File; signedByName: string; supersedes?: string }) => Promise<boolean>;
  clearError: () => void;
}

export function useAttest(): AttestActions {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const attest = useCallback(
    async (input: { documentId: string; file: File; signedByName: string; supersedes?: string }) => {
      setError('');
      setBusy(true);
      try {
        const body = new FormData();
        body.set('documentId', input.documentId);
        body.set('file', input.file);
        body.set('signedByName', input.signedByName);
        if (input.supersedes) body.set('supersedes', input.supersedes);

        const res = await fetch('/api/labour-registers/attest', { method: 'POST', body });
        const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(typeof answer.error === 'string' ? answer.error : 'That could not be recorded.');
        }
        router.refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be recorded.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, attest, clearError: () => setError('') };
}
