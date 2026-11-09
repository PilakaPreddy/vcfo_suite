'use client';

import { useState } from 'react';
import { Bot, Coins, Wand2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { useAssistAgentRuns, useAssistPatches, useReviewAssistPatch } from '@/hooks/use-assist-agents';
import { isAdminOrManager } from '@/lib/auth';
import { findSubAgent } from '@/lib/assist-agents/catalog';
import type { AssistAgentRunStatus, AssistAgentRunView, AssistPatchStatus, AssistPatchView } from '@/lib/assist-agents/types';
import { toastError, toastSuccess } from '@/lib/toast-errors';

/**
 * ASSIST RUNS — one page for every staff role (docs/specs/vcfo-assist-agents/PLAN.md): the VCFO
 * Assist agents' recent runs in the viewer's scope and the recipe patch review queue. The
 * repositories decide what each role sees; only admins and managers get Approve and Reject.
 */

const RUN_LOOK: Record<AssistAgentRunStatus, { label: string; tone: ChipTone }> = {
  running: { label: 'In progress', tone: 'prog' },
  waiting_user: { label: 'Waiting', tone: 'teal' },
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'idle' },
};

const PATCH_LOOK: Record<AssistPatchStatus, { label: string; tone: ChipTone }> = {
  proposed: { label: 'Waiting', tone: 'teal' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

const PATCH_VIEWS = [
  { value: 'proposed', label: 'To review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const number = (n: number) => n.toLocaleString('en-IN');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Heals by tier, as "T1 2 · T3 1"; failed heals count too, because they are the ones to look at. */
function healSummary(run: AssistAgentRunView): string {
  if (run.heals.length === 0) return 'None';
  const byTier = new Map<string, number>();
  for (const heal of run.heals) byTier.set(heal.tier, (byTier.get(heal.tier) ?? 0) + 1);
  const failed = run.heals.filter((h) => !h.ok).length;
  const tiers = [...byTier.entries()].sort().map(([tier, n]) => `${tier} ${n}`);
  return failed ? `${tiers.join(' · ')} (${failed} failed)` : tiers.join(' · ');
}

const TH = 'whitespace-nowrap px-3 py-2 font-medium';
const TD = 'whitespace-nowrap px-3 py-2.5 text-ink-2';

function RunsTable({ runs }: { runs: AssistAgentRunView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="text-[12px] text-ink-muted">
          <tr>
            <th scope="col" className={`${TH} pl-4`}>
              Agent
            </th>
            <th scope="col" className={TH}>
              Client
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Fields filled
            </th>
            <th scope="col" className={TH}>
              Heals
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Tokens
            </th>
            <th scope="col" className={TH}>
              SRN
            </th>
            <th scope="col" className={`${TH} pr-4`}>
              Started
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const sub = findSubAgent(run.subAgent);
            const look = RUN_LOOK[run.status] ?? RUN_LOOK.running;
            return (
              <tr key={run.id} className="border-t border-line-soft">
                <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">
                  {sub?.form ?? run.subAgent}
                  <span className="ml-2 font-mono text-[11.5px] font-normal text-ink-muted">v{run.recipeVersion}</span>
                </th>
                <td className={`${TD} max-w-[220px] truncate`}>{run.companyName ?? '—'}</td>
                <td className={TD}>
                  <Chip raw tone={look.tone}>
                    {look.label}
                  </Chip>
                  {run.error ? <span className="ml-2 text-[12px] text-danger">{run.error.slice(0, 60)}</span> : null}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {run.fieldsFilled} / {run.fieldsTotal}
                </td>
                <td className={TD}>{healSummary(run)}</td>
                <td className={`${TD} text-right tabular-nums`}>{run.aiTokens ? number(run.aiTokens) : '0'}</td>
                <td className={`${TD} font-mono text-[12.5px]`}>{run.srn ?? '—'}</td>
                <td className={`${TD} pr-4 text-ink-muted`}>
                  {when(run.startedAt)}
                  {run.userName ? ` · ${run.userName}` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PatchRow({ patch, canReview }: { patch: AssistPatchView; canReview: boolean }) {
  const review = useReviewAssistPatch();
  const look = PATCH_LOOK[patch.status];
  const decide = (decision: 'approved' | 'rejected') =>
    review.mutate(
      { id: patch.id, decision },
      {
        onSuccess: () => toastSuccess(decision === 'approved' ? 'Fix approved' : 'Fix rejected', 'Approved fixes go into the next recipe version.'),
        onError: (err) => toastError('Could not save the decision', err.message),
      },
    );
  const target = patch.proposed.som ?? patch.proposed.css ?? patch.proposed.label ?? '';
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-soft px-4 py-3 first:border-t-0">
      <span className="flex-none">
        <Chip raw tone={look.tone} className="min-w-[104px]">
          {look.label}
        </Chip>
      </span>
      <span className="min-w-0 flex-1 basis-[280px]">
        <span className="block truncate text-[14px] text-ink">
          {patch.evidence.fieldLabel ?? patch.fieldKey}
          <span className="ml-2 font-mono text-[11.5px] text-ink-muted">
            {patch.recipeId}@{patch.recipeVersion}
          </span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[12px] text-ink-muted" title={target}>
          {target}
        </span>
        {patch.evidence.chosenLabel ? (
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">Matched “{patch.evidence.chosenLabel}”</span>
        ) : null}
      </span>
      <Tag tone={patch.sourceTier === 'T3' ? 'violet' : 'idle'}>{patch.sourceTier}</Tag>
      {canReview && patch.status === 'proposed' ? (
        <span className="flex flex-none gap-2">
          <Button size="sm" variant="success" disabled={review.isPending} onClick={() => decide('approved')}>
            Approve
          </Button>
          <Button size="sm" variant="quiet" disabled={review.isPending} onClick={() => decide('rejected')}>
            Reject
          </Button>
        </span>
      ) : null}
    </li>
  );
}

export default function AssistRunsPage() {
  const { user } = useApp();
  const canReview = isAdminOrManager(user?.role);
  const [view, setView] = useState<AssistPatchStatus | 'all'>('proposed');
  const runsQuery = useAssistAgentRuns();
  const patchesQuery = useAssistPatches(view);
  const runs = runsQuery.data?.runs ?? [];
  const patches = patchesQuery.data?.patches ?? [];
  const filled = runs.reduce((sum, r) => sum + r.fieldsFilled, 0);
  const tokens = runs.reduce((sum, r) => sum + r.aiTokens, 0);
  const aiFree = runs.filter((r) => r.aiCalls === 0).length;

  return (
    <div className="grid min-w-0 gap-4">
      <DashHero
        title="Assist runs"
        subtitle="What the VCFO Assist agents filled, where they had to heal a field, and the fixes waiting for review."
        stats={[
          { label: 'Runs', icon: Bot, value: runs.length },
          { label: 'Fields filled', icon: Wand2, value: number(filled) },
          { label: 'Runs with no AI call', value: aiFree, of: `/ ${runs.length}` },
          { label: 'Tokens', icon: Coins, value: number(tokens) },
        ]}
      />

      <DashSection title="Recent runs" meta={runsQuery.isLoading ? undefined : runs.length} flush>
        {runsQuery.isLoading ? (
          <SkeletonRows />
        ) : runsQuery.isError ? (
          <p role="alert" className="m-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            Could not load the runs. Refresh the page.
          </p>
        ) : runs.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No agent runs yet"
              action={
                <span className="max-w-[460px] text-[13px]">
                  A run shows here when someone fills a portal form with the VCFO Assist side panel in Chrome, next to a signed-in
                  Suite tab.
                </span>
              }
            />
          </div>
        ) : (
          <RunsTable runs={runs} />
        )}
      </DashSection>

      <DashSection
        title="Recipe fixes"
        meta={patchesQuery.isLoading ? undefined : patches.length}
        flush
        right={
          <FilterSelect
            aria-label="Which fixes"
            options={PATCH_VIEWS}
            value={view}
            onChange={(event) => setView(event.target.value as AssistPatchStatus | 'all')}
          />
        }
      >
        {patchesQuery.isLoading ? (
          <SkeletonRows />
        ) : patches.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={view === 'proposed' ? 'No fixes waiting for review' : 'No fixes here'}
              action={
                view === 'proposed' ? (
                  <span className="max-w-[460px] text-[13px]">When an agent finds a better way to reach a field, it proposes the fix here.</span>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul>
            {patches.map((patch) => (
              <PatchRow key={patch.id} patch={patch} canReview={canReview} />
            ))}
          </ul>
        )}
      </DashSection>
    </div>
  );
}
