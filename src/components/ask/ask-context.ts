'use client';

import { createContext, useContext } from 'react';
import type { AnswerDepth, AnswerEnvelope, AskShell } from '@/data/ask/schema';
import type { ChatBody } from '@/hooks/ask/ask-api';

export type ThreadItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; messageId: string | null; answer: AnswerEnvelope }
  | { id: string; kind: 'error'; text: string }
  /** A review card opened from a link, such as a manager's notification. */
  | { id: string; kind: 'changeset'; changesetId: string };

export type AskPreview = { engagementId: string; companyName: string };

/**
 * One past conversation in the person's chat list (owner item F4). The list comes from
 * `GET /api/ask/conversations` (the caller's own chats); localStorage per user is only the
 * offline fallback. The messages themselves are read from `/api/ask/conversations/[id]`.
 */
export type AskHistoryEntry = {
  id: string;
  title: string;
  /** ISO time of the last answer. */
  at: string;
  /** The storage key of the shell and engagement the chat belongs to. */
  scope: string;
  /** Messages in the chat (server list only). */
  messageCount?: number;
};

export type AskInput = {
  message?: string;
  suggestionId?: string;
  label?: string;
  context?: ChatBody['context'];
  depth?: AnswerDepth;
  attachmentIds?: string[];
};

export interface AskContextValue {
  enabled: boolean;
  firmName: string;
  /** Phase 9 feature flags (§9A); all off unless the server turns one on. */
  features: Partial<Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'A1', boolean>>;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  shell: AskShell | null;
  /** Engagement answers are scoped to (client, or super admin preview). */
  engagementId: string | null;
  preview: AskPreview | null;
  setPreview: (preview: AskPreview | null) => void;
  thread: ThreadItem[];
  status: string | null;
  busy: boolean;
  conversationId: string | null;
  ask: (input: AskInput) => Promise<void>;
  /** Re-read a topic at another depth without a model call. */
  showTopic: (slug: string, depth?: AnswerDepth, label?: string) => Promise<void>;
  reset: () => void;
  /** Past chats of this shell and engagement, newest first (server list; localStorage offline). */
  history: AskHistoryEntry[];
  /** Show a past chat (the full page's chat list). */
  openConversation: (id: string) => void;
  /** True while the full Ask VCFO page is on screen: the pop-up hides and the thread loads. */
  pageOpen: boolean;
  setPageOpen: (open: boolean) => void;
  /** Shown after a go-there link closed the panel (< 1440 px): "Back to Ask VCFO". */
  backPill: boolean;
  setBackPill: (show: boolean) => void;
  /** Pending hand-off draft (T5), opened from an answer's "Ask my lead". */
  handoffDraft: string | null;
  setHandoffDraft: (draft: string | null) => void;
}

export const AskContext = createContext<AskContextValue | null>(null);

/** Null outside the provider (managers, Project Leads): callers render nothing. */
export function useAskOptional(): AskContextValue | null {
  return useContext(AskContext);
}

