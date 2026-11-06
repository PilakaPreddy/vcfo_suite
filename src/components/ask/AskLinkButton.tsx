'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { AnswerLink } from '@/data/ask/schema';
import { useAskLinkBase } from '@/components/ask/use-ask-link-base';
import { resolveHref } from '@/lib/ask/resolve-href';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { useAskOptional } from './ask-context';
import { useAskLayoutMode } from './use-ask-layout';

/**
 * A go-there link (§7.7). Navigates only. The floating card stays open over the
 * new page; on phones, where Ask fills the screen, it closes and leaves a
 * "Back to Ask VCFO" pill.
 * The primary link is the blurple main button; the rest are white secondary buttons.
 */
export function AskLinkButton({ link }: { link: AnswerLink }) {
  const ask = useAskOptional();
  const base = useAskLinkBase();
  const mode = useAskLayoutMode();
  if (!ask) return null;
  return (
    <Link
      href={resolveHref(link.dest, base)}
      onClick={() => {
        if (mode === 'sheet') {
          ask.setOpen(false);
          ask.setBackPill(true);
        }
      }}
      className={cn(buttonVariants({ variant: link.primary ? 'default' : 'secondary', size: 'sm' }))}
    >
      {link.label}
      <ArrowUpRight aria-hidden />
    </Link>
  );
}
