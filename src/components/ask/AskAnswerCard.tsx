'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { saveToLibrary } from '@/hooks/ask/ask-api';
import { useAskLinkBase } from '@/components/ask/use-ask-link-base';
import { getTopic } from '@/lib/ask/topics';
import { clientStepHref } from '@/lib/client/client-overview';
import { askProjectPath } from '@/lib/ask/resolve-href';
import { reminderComposeHref } from '@/lib/ask/reminder';
import { buttonVariants } from '@/components/ui/button-variants';
import { Tag } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { useAskOptional } from './ask-context';
import { AskLinkButton } from './AskLinkButton';
import { TrustBadge } from './TrustBadge';
import { VisualRenderer } from './visuals/VisualRenderer';

const secondary = buttonVariants({ variant: 'secondary', size: 'sm' });

const voteButton =
  'grid h-7 w-7 place-items-center rounded-mark hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25 disabled:pointer-events-none';


/**
 * Answer card (§7.5): badge · line · visual · why · sources · actions ·
 * related. Staff cards drop the client-only rows. Spectrum look from the
 * prototype AskThread: a 1.5px card, numbered sources, and "Helpful?" votes
 * on every answer (clients through `/api/client/portal/feedback`, staff through
 * `/api/ask/feedback`, G-24).
 */
export function AskAnswerCard({
  answer,
  messageId,
  lastQuestion,
}: {
  answer: AnswerEnvelope;
  messageId: string | null;
  lastQuestion?: string;
}) {
  const ask = useAskOptional();
  const router = useRouter();
  const linkBase = useAskLinkBase();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  if (!ask) return null;
  const client = ask.shell === 'client';
  const has = (a: AnswerEnvelope['actions'][number]) => answer.actions.includes(a);
  const canSave = client && has('save') && !ask.preview && (answer.topicSlug || messageId) && ask.engagementId;
  const rowTarget = answer.target?.engagementId;
  // Go-there links replace the older open-step / open-project buttons.
  const hasLinks = Boolean(answer.links && answer.links.length > 0);

  const canVote = !ask.preview && answer.origin !== 'refusal';
  const sendVote = (v: 'up' | 'down') => {
    if (vote) return;
    setVote(v);
    void fetch(client ? '/api/client/portal/feedback' : '/api/ask/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vote: v, messageId: messageId ?? undefined, question: lastQuestion, answer: answer.line }),
    }).catch(() => undefined);
  };

  const changeDepth = (depth: 'simple' | 'detail') => {
    if (answer.topicSlug) void ask.showTopic(answer.topicSlug, depth, depth === 'simple' ? 'Simpler, please' : 'More detail, please');
    else void ask.ask({ message: depth === 'simple' ? 'Explain that more simply.' : 'Tell me more detail.', depth });
  };

  return (
    <article className="grid gap-3 rounded-md border-1.5 border-line bg-surface-raised px-3 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <TrustBadge answer={answer} firmName={ask.firmName} />
        {answer.depth !== 'normal' && <Tag>{answer.depth === 'simple' ? 'Simpler' : 'More detail'}</Tag>}
      </div>

      <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink">{answer.line}</p>

      {answer.visual && <VisualRenderer visual={answer.visual} />}

      {answer.why && client && (
        <div>
          <h4 className="text-[12px] font-medium text-ink-muted">Why it matters to you</h4>
          <p className="text-[13px] text-ink-2">{answer.why}</p>
        </div>
      )}

      {answer.citations.length > 0 && (
        <div>
          <h4 className="mb-1 text-[12px] font-medium text-ink-muted">Sources</h4>
          <ol className="grid gap-1">
            {answer.citations.map((c, i) => (
              <li key={c.id} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <span className="grid h-4 w-4 flex-none place-items-center rounded-[3px] bg-brand-soft text-[11px] font-medium tabular-nums text-brand-text" aria-hidden>
                  {i + 1}
                </span>
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-0.5 font-medium text-brand-text underline-offset-2 hover:underline"
                  >
                    <span className="truncate">{c.label}</span>
                    <ExternalLink className="h-3 w-3 flex-none" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="truncate text-ink-2">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {answer.links && answer.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {answer.links.map((link, i) => (
            <AskLinkButton key={`${link.dest.to}-${i}`} link={link} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {canSave && (
          <button
            type="button"
            className={cn(secondary, saved && 'border-positive-mid text-positive')}
            disabled={saving || saved}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              try {
                await saveToLibrary({
                  engagementId: ask.engagementId!,
                  ...(answer.topicSlug ? { topicSlug: answer.topicSlug, answer } : { messageId: messageId! }),
                });
                setSaved(true);
              } catch (err) {
                setSaveError((err as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saved ? (
              <>
                <Check aria-hidden /> Saved to library
              </>
            ) : (
              'Save to library'
            )}
          </button>
        )}
        {has('simpler') && (
          <button type="button" className={secondary} onClick={() => changeDepth('simple')} disabled={ask.busy}>
            Simpler
          </button>
        )}
        {has('detail') && (
          <button type="button" className={secondary} onClick={() => changeDepth('detail')} disabled={ask.busy}>
            More detail
          </button>
        )}
        {has('expand') && answer.topicSlug && client && !ask.preview && (
          <button type="button" className={secondary} onClick={() => router.push(`/app/client/learn/${answer.topicSlug}`)}>
            Expand
          </button>
        )}
        {has('openStep') && !hasLinks && answer.target?.stepId && client && !ask.preview && (
          <Link href={clientStepHref(answer.target.stepId)} className={secondary}>
            Open step
          </Link>
        )}
        {has('askLead') && client && !ask.preview && (
          <button type="button" className={secondary} onClick={() => ask.setHandoffDraft(lastQuestion ?? '')}>
            Ask my lead
          </button>
        )}
        {has('openProject') && !hasLinks && !client && rowTarget && (
          <Link href={askProjectPath(rowTarget, linkBase)} className={secondary}>
            Open in Projects
          </Link>
        )}
        {has('draftReminder') && !client && (
          <Link href={reminderComposeHref(linkBase, answer)} className={secondary}>
            Draft reminder
          </Link>
        )}
      </div>
      {saveError && (
        <p role="alert" className="text-[12.5px] text-danger">
          {saveError}
        </p>
      )}

      {canVote && (
        <div className="flex items-center gap-1 border-t border-line-soft pt-2">
          <span className="ml-auto text-[12px] text-ink-muted">{vote ? 'Thanks' : 'Helpful?'}</span>
          <button
            type="button"
            aria-label="Helpful"
            aria-pressed={vote === 'up'}
            disabled={vote !== null}
            onClick={() => sendVote('up')}
            className={cn(voteButton, vote === 'up' ? 'text-positive' : 'text-ink-muted')}
          >
            <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label="Not helpful"
            aria-pressed={vote === 'down'}
            disabled={vote !== null}
            onClick={() => sendVote('down')}
            className={cn(voteButton, vote === 'down' ? 'text-danger' : 'text-ink-muted')}
          >
            <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      )}

      {answer.related && answer.related.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line-soft pt-2">
          {answer.related.slice(0, 2).map((slug) => {
            const topic = getTopic(slug);
            if (!topic) return null;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => void ask.showTopic(slug, undefined, topic.question)}
                className="rounded-md border-1.5 border-line px-2.5 py-1 text-left text-[12.5px] text-ink-2 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
              >
                {topic.question}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
