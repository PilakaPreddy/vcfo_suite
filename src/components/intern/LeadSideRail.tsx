'use client';

import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashSection } from '@/components/dash/DashSection';
import { InternWorkCtaButton } from '@/components/intern/InternWorkCtaButton';
import { RemindClientButton } from '@/components/reminders/RemindClientButton';
import { remindableItemKey } from '@/lib/reminders/reminder-rules';
import { ClientDot } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { internWaitingItems, type InternWorkItem } from '@/lib/intern/intern-work';

/* The rail's Waiting on card (prototype WaitingOnClient, K-31): what the client or the manager
   still owes. Each row has the company tile, the item, the company and how long it has waited,
   and the reminder or nudge action. What the client owes gets the
   one-click Remind (G-15), with Mail as the fallback when the reminder cannot go out. */
export function LeadSideRail({ items, mailHref = '/app/intern/mail', title = 'Waiting on client' }: { items: InternWorkItem[]; mailHref?: string; title?: string }) {
  const router = useRouter();
  const all = internWaitingItems(items);
  const waiting = all.slice(0, 5);

  return (
    <div className="flex flex-col gap-5" data-intern-waiting-on>
      <DashSection title={title} meta={all.length ? String(all.length) : undefined} bodyClassName="p-0">
        {waiting.length === 0 ? (
          <EmptyState title="Nothing waiting" className="m-4" />
        ) : (
          <ul>
            {waiting.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
                <ClientDot name={item.companyName} />
                <span className="min-w-0 flex-1">
                  <Link href={item.href} className="block truncate font-medium text-ink hover:underline" title={item.title}>
                    {item.title}
                  </Link>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {[shortCompany(item.companyName), item.catalogLabel, item.kind === 'waiting-manager' ? 'Manager' : null, item.ageLabel ? `${item.ageLabel} waiting` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex-none">
                  {remindableItemKey(item) ? (
                    <RemindClientButton
                      engagementId={item.engagementId}
                      itemKey={remindableItemKey(item)!}
                      title={item.title}
                      onFailed={() => router.push(mailHref)}
                    />
                  ) : (
                    <InternWorkCtaButton item={item} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashSection>
    </div>
  );
}
