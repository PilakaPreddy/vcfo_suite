'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReadinessSummary } from '@/lib/labour-registers/readiness';

/**
 * Closing a period, reopening it, and building its registers.
 *
 * Three calls, deliberately not two. `markReady` refuses a second call, but generation has to
 * stay retryable: a failure halfway through twenty-nine registers must be recoverable by
 * pressing the button again, and every form that already succeeded will then be a cache hit.
 * So the close posts, and then generation posts, and a failure of the second does not undo the
 * first.
 *
 * What comes back from generation is worth showing rather than swallowing. "Twenty of twenty
 * served from storage" is the whole argument for the caching design, and a blocked form naming
 * what it was short of is more use than a count of successes.
 */

export interface GenerateOutcome {
  built: number;
  fromStorage: number;
  blocked: Array<{ formId: string; reason: string }>;
  deferred: Array<{ formId: string; reason: string }>;
}

export interface BatchActions {
  busy: null | 'closing' | 'generating' | 'reopening';
  error: string;
  outcome: GenerateOutcome | null;
  /** Close the period, then build everything it calls for. */
  closeAndGenerate: (summary: ReadinessSummary) => Promise<void>;
  /** Build again without closing again — for a retry, or after a reopen. */
  generate: () => Promise<void>;
  reopen: (reason: string) => Promise<void>;
  /** State that the month was fully present, rather than uploading a sheet. */
  assumeAttendance: (weekOff: string) => Promise<void>;
  /** Record whose rules this establishment is under. Changes which registers exist. */
  setSphere: (sphere: 'state' | 'central') => Promise<void>;
  dismissOutcome: () => void;
}

async function post(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof answer.error === 'string' ? answer.error : 'The request failed.');
  return answer;
}

export function useBatchActions(batchId: string, companyName?: string): BatchActions {
  const router = useRouter();
  const [busy, setBusy] = useState<BatchActions['busy']>(null);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<GenerateOutcome | null>(null);

  const runGenerate = useCallback(async () => {
    const answer = await post('/api/labour-registers/generate', { batchId, companyName });
    setOutcome({
      built: Number(answer.builtCount ?? 0),
      fromStorage: Number(answer.fromStorage ?? 0),
      blocked: (answer.blocked ?? []) as GenerateOutcome['blocked'],
      deferred: (answer.deferred ?? []) as GenerateOutcome['deferred'],
    });
  }, [batchId, companyName]);

  const closeAndGenerate = useCallback(
    async (summary: ReadinessSummary) => {
      setError('');
      setBusy('closing');
      try {
        await post('/api/labour-registers/ready', {
          batchId,
          accuracyConfirmed: true,
          readiness: summary as unknown as Record<string, unknown>,
        });
        setBusy('generating');
        await runGenerate();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The period could not be closed.');
      } finally {
        setBusy(null);
      }
    },
    [batchId, router, runGenerate],
  );

  const generate = useCallback(async () => {
    setError('');
    setBusy('generating');
    try {
      await runGenerate();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The registers could not be built.');
    } finally {
      setBusy(null);
    }
  }, [router, runGenerate]);

  const reopen = useCallback(
    async (reason: string) => {
      setError('');
      setBusy('reopening');
      try {
        await post('/api/labour-registers/ready', { batchId, reason }, 'PATCH');
        setOutcome(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The period could not be reopened.');
      } finally {
        setBusy(null);
      }
    },
    [batchId, router],
  );

  const assumeAttendance = useCallback(
    async (weekOff: string) => {
      setError('');
      setBusy('generating');
      try {
        /* Keyed, so the muster rolls are rebuilt if a real sheet arrives later. */
        await post('/api/labour-registers/assumptions', {
          batchId,
          assumptions: { fullAttendanceAssumed: true, weekOff },
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be recorded.');
      } finally {
        setBusy(null);
      }
    },
    [batchId, router],
  );

  const setSphere = useCallback(
    async (sphere: 'state' | 'central') => {
      setError('');
      setBusy('generating');
      try {
        await post('/api/labour-registers/assumptions', { batchId, assumptions: { sphere } });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be recorded.');
      } finally {
        setBusy(null);
      }
    },
    [batchId, router],
  );

  return {
    busy,
    error,
    outcome,
    closeAndGenerate,
    generate,
    reopen,
    assumeAttendance,
    setSphere,
    dismissOutcome: () => setOutcome(null),
  };
}
