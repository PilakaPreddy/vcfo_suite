'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Recording where a state has got to under one code, and undoing it.
 *
 * Busy is keyed on `state:code` rather than being a boolean, because the screen shows four
 * cells per state and a single flag would grey out all four while one was saving.
 */
export interface CodeRuleActions {
  busy: string | null;
  error: string;
  save: (input: {
    stateCode: string;
    code: string;
    stage: 'notified' | 'draft' | 'none';
    notifiedOn?: string;
    source?: string;
    note?: string;
  }) => Promise<boolean>;
  clear: (stateCode: string, code: string) => Promise<void>;
}

export function useCodeRules(): CodeRuleActions {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = useCallback<CodeRuleActions['save']>(
    async (input) => {
      setError('');
      setBusy(`${input.stateCode}:${input.code}`);
      try {
        const res = await fetch('/api/labour-registers/code-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
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
    async (stateCode: string, code: string) => {
      setError('');
      setBusy(`${stateCode}:${code}`);
      try {
        const res = await fetch(
          `/api/labour-registers/code-rules?stateCode=${encodeURIComponent(stateCode)}&code=${encodeURIComponent(code)}`,
          { method: 'DELETE' },
        );
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
