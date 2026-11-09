'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SEO } from '@/components/SEO';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { PageBackCluster } from '@/components/shell/PageBackButton';
import { PageTransition } from '@/components/shell/PageTransition';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Tag } from '@/components/ui/spectrum-chip';
import type { AskUsageReport, AskUsageRow } from '@/db/repositories/ask-usage';
import { totalTokens } from '@/lib/ask/provider/pricing';

const PATH_LABELS: Record<string, string> = {
  suggestion: 'Suggestion click',
  context: "What's this",
  greeting_local: 'Greeting in code',
  metric_local: 'Metric in code',
  topic_local: 'Topic in code',
  saved_answer: 'Saved answer',
  router_refusal: 'Router, refused',
  router_topic: 'Router, reviewed topic',
  router_metric: 'Router, metric',
  document_answer: 'Document answer',
  tool_answer: 'Answer with tools',
  fixed_workflow: 'Fixed workflow',
  agent_run: 'Agent run',
  watch: 'Watch',
  assist_resolve: 'VCFO Assist field match',
  unrecorded: 'Before tracking',
};

const RANGES = [7, 30, 90].map((days) => ({ value: String(days), label: `Last ${days} days` }));

const number = (n: number) => n.toLocaleString('en-IN');
const money = (n: number) => `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;

const COLUMNS: Array<{ label: string; value: (r: AskUsageRow) => string }> = [
  { label: 'Messages', value: (r) => number(r.messages) },
  { label: 'Model calls', value: (r) => number(r.calls) },
  { label: 'Input', value: (r) => number(r.inputTokens) },
  { label: 'Cache read', value: (r) => number(r.cacheReadTokens) },
  { label: 'Cache write', value: (r) => number(r.cacheWriteTokens) },
  { label: 'Output', value: (r) => number(r.outputTokens) },
  { label: 'Per message', value: (r) => (r.messages > 0 ? number(Math.round(totalTokens(r) / r.messages)) : '–') },
  { label: 'Est. cost', value: (r) => money(r.costUsd) },
];

/** Super admin: what each Ask VCFO path spends, against today's budget and the kill switches. */
export default function AskTokenUse() {
  const [days, setDays] = useState('30');
  const query = useQuery({
    queryKey: ['ask', 'usage', days],
    queryFn: async (): Promise<AskUsageReport> => {
      const res = await fetch(`/api/ask/admin/usage?days=${days}`);
      const body = (await res.json().catch(() => null)) as (AskUsageReport & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error || 'Could not load token use');
      return body;
    },
  });
  const data = query.data;

  return (
    <PageTransition>
      <SEO title="Ask VCFO token use" description="Tokens and estimated cost per Ask VCFO path" path="/app/admin/ask-vcfo/usage" />
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <PageBackCluster className="min-w-0 flex-[1_1_240px]">
            <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Token use</h1>
          </PageBackCluster>
          <Link href="/app/admin/ask-vcfo/gaps" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Question gaps
          </Link>
          <Link href="/app/admin/ask-vcfo/sources" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Sources
          </Link>
        </div>

        <section aria-labelledby="usage-title" className="surface min-w-0 overflow-hidden">
          <header className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-4 py-2">
            <CardHeadTile title="Analytics" />
            <h2 id="usage-title" className="text-[15px] font-medium text-ink">
              Tokens per path
            </h2>
            {data ? (
              <span className="text-[13px] tabular-nums text-ink-muted">
                Today {number(data.todayTokens)} of {number(data.dailyBudget)} budget
              </span>
            ) : null}
            <FilterSelect
              aria-label="Period"
              className="ml-auto"
              options={RANGES}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </header>

          {query.isLoading && <SkeletonRows rows={4} className="p-4" />}
          {query.isError && (
            <p role="alert" className="m-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Could not load token use. Refresh the page.
            </p>
          )}
          {data && data.rows.length === 0 && <EmptyState title="No Ask VCFO messages in this period" className="m-4" />}
          {data && data.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[12px] text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Path
                    </th>
                    {COLUMNS.map((column) => (
                      <th key={column.label} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.path} className="border-t border-line-soft">
                      <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">
                        {PATH_LABELS[row.path] ?? row.path}
                        {data.killedPaths.includes(row.path) ? (
                          <Tag tone="bad" className="ml-2">
                            Off
                          </Tag>
                        ) : null}
                      </th>
                      {COLUMNS.map((column) => (
                        <td key={column.label} className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                          {column.value(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data ? (
            <p className="border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-muted">
              Cost is an estimate at list price. Switch a path off with ASK_KILL_PATHS.
              {data.killedPaths.length > 0 ? ` Off now: ${data.killedPaths.map((p) => PATH_LABELS[p] ?? p).join(', ')}.` : ''}
            </p>
          ) : null}
        </section>
      </div>
    </PageTransition>
  );
}
