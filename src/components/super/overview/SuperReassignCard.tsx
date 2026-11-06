'use client';

import { useMemo, useState } from 'react';
import { Loader2, Repeat } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { toastUndo } from '@/components/ui/undo-toast';
import { useInvalidateSuperReads } from '@/components/super/assign/use-super-staff';
import { shortCompany } from '@/components/super/parts/super-text';
import { buildReassignSuggestions, type ReassignSuggestion } from '@/lib/super/reassign-model';
import type { SuperInsightClient, SuperTeamManager } from '@/lib/super/super-insights-model';
import type { PersonMetrics } from '@/lib/metrics/practice-metrics';
import { errorMessage, toastError } from '@/lib/toast-errors';

/**
 * "Reassign" (P-189, prototype Team rail card): the moves `buildReassignSuggestions` finds in the
 * stored assignments and loads, each with one button. Assign and Reassign save through
 * `/api/super/assign` (the same route as the assign dialog, which audits and emails each change);
 * the row then shows a Done chip and the toast offers Undo when there was someone to go back to.
 */
async function assign(engagementId: string, kind: ReassignSuggestion['kind'], personId: string): Promise<void> {
  const res = await fetch('/api/super/assign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ engagementId, ...(kind === 'manager' ? { managerId: personId } : { internId: personId }) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'assign_failed');
  }
}

export function SuperReassignCard({
  clients,
  managers,
  people,
}: {
  clients: SuperInsightClient[];
  managers: SuperTeamManager[];
  people: Map<string, PersonMetrics>;
}) {
  const invalidate = useInvalidateSuperReads();
  const [done, setDone] = useState<ReassignSuggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const suggestions = useMemo(
    () => buildReassignSuggestions({ clients, managers, load: (id) => people.get(id)?.load }),
    [clients, managers, people],
  );
  const doneIds = new Set(done.map((d) => d.engagementId));
  const rows = [...done, ...suggestions.filter((s) => !doneIds.has(s.engagementId))];

  async function apply(s: ReassignSuggestion) {
    setBusy(s.id);
    try {
      await assign(s.engagementId, s.kind, s.toId);
      setDone((d) => [...d, s]);
      await invalidate();
      const name = shortCompany(s.companyName);
      const back = s.fromId;
      toastUndo(
        `${name} is now with ${s.toName}`,
        back
          ? () => {
              void assign(s.engagementId, s.kind, back)
                .then(async () => {
                  setDone((d) => d.filter((x) => x.id !== s.id));
                  await invalidate();
                })
                .catch((err) => toastError('Could not undo', errorMessage(err)));
            }
          : undefined,
      );
    } catch (err) {
      toastError('Could not save', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashSection title="Reassign" headIcon={{ icon: Repeat, tone: 'violet' }} flush>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing to move" />
        </div>
      ) : (
        <ul>
          {rows.map((s) => {
            const isDone = done.some((d) => d.id === s.id);
            return (
              <li key={s.id} className="flex min-h-[56px] items-center gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{shortCompany(s.companyName)}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {s.fromName} to {s.toName} · {s.why}
                  </span>
                </span>
                {isDone ? (
                  <Chip raw fixed tone="ok">
                    Done
                  </Chip>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void apply(s)}>
                    {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {s.action}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}
