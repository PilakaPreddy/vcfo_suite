'use client';

import { sep } from '@/lib/date-format';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { PageTransition } from '@/components/shell/PageTransition';
import { PageBackCluster } from '@/components/shell/PageBackButton';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { draftTopicFor, type GapGroup } from '@/lib/ask/question-gaps';
import { TokenUseLink } from './TokenUseLink';

type GapsResponse = { days: number; total: number; groups: GapGroup[]; showsCompanies: boolean };

/** Hand the reviewer a draft topic file to edit and add by pull request. */
function downloadDraftTopic(question: string) {
  const topic = draftTopicFor(question);
  const blob = new Blob([`${JSON.stringify(topic, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(topic.slug)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDay(iso: string): string {
  return sep(new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
}

/**
 * A1: client questions with no reviewed answer, grouped, without client identity. VCFO Spectrum:
 * a plain head and the groups as rows in one section card.
 */
export default function AskQuestionGaps() {
  const query = useQuery({
    queryKey: ['ask', 'gaps'],
    queryFn: async (): Promise<GapsResponse | null> => {
      const res = await fetch('/api/ask/admin/gaps');
      if (res.status === 404) return null;
      const body = (await res.json().catch(() => null)) as (GapsResponse & { error?: string; off?: boolean }) | null;
      if (!res.ok || !body) throw new Error(body?.error || 'Could not load question gaps');
      if (body.off) return null;
      return body;
    },
  });
  const data = query.data;

  return (
    <PageTransition>
      <SEO title="Ask VCFO question gaps" description="Client questions with no reviewed answer yet" path="/app/admin/ask-vcfo/gaps" />
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <PageBackCluster className="min-w-0 flex-[1_1_240px]">
            <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Question gaps</h1>
          </PageBackCluster>
          <Link href="/app/admin/ask-vcfo/sources" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Sources
          </Link>
          <TokenUseLink />
        </div>

        <section aria-labelledby="gaps-title" className="surface min-w-0 overflow-hidden">
          <header className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-4 py-2">
            <CardHeadTile title="Inbox" />
            <h2 id="gaps-title" className="text-[15px] font-medium text-ink">
              Questions without a reviewed answer
            </h2>
            {data ? (
              <span className="text-[13px] tabular-nums text-ink-muted">
                Last {data.days} days · {data.total}
                {data.showsCompanies ? '' : ' · client names hidden'}
              </span>
            ) : null}
          </header>

          {query.isLoading && <SkeletonRows rows={4} className="p-4" />}
          {query.isError && (
            <p role="alert" className="m-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Could not load question gaps. Refresh the page.
            </p>
          )}
          {query.isSuccess && data === null && (
            <EmptyState title="Question gaps are turned off for this firm" className="m-4" />
          )}
          {data && data.groups.length === 0 && <EmptyState title="No gaps. Reviewed topics cover what clients ask" className="m-4" />}
          {data && data.groups.length > 0 && (
            <ul>
              {data.groups.map((group) => (
                <li
                  key={`${group.question}-${group.lastAskedAt}`}
                  className="flex flex-wrap items-start gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5"
                >
                  <span className="mt-0.5 inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md bg-surface-sunken px-2 text-[12px] font-medium tabular-nums text-ink">
                    {group.count}
                    <span className="sr-only"> times asked</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink">{group.question}</p>
                    {group.examples.length > 1 && (
                      <ul className="mt-1 space-y-0.5 text-[12.5px] text-ink-2">
                        {group.examples.slice(1).map((example) => (
                          <li key={example}>Also: {example}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-[12.5px] text-ink-muted">
                      Last asked {formatDay(group.lastAskedAt)}
                      {group.generated > 0 ? ` · ${group.generated} AI answered` : ''}
                      {group.handoffs > 0 ? ` · ${group.handoffs} sent to a lead` : ''}
                      {group.companies.length > 0 ? ` · ${group.companies.join(', ')}` : ''}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadDraftTopic(group.question)}>
                    <FileDown aria-hidden /> Draft topic
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
