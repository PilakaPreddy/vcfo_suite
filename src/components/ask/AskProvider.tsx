'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnswerDepth, AskShell } from '@/data/ask/schema';
import { useApp } from '@/context/AppContext';
import { findEngagementForClientUser } from '@/lib/checklist/checklist-state-key';
import { canUseAsk, defaultShellForRole } from '@/lib/ask/access';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import {
  createAskDrop,
  fetchConversation,
  fetchConversationList,
  recordTopicAnswer,
  startAskDrop,
  streamChat,
  uploadDrop,
  type StoredMessage,
} from '@/hooks/ask/ask-api';
import { isRunActive, useAskRun } from '@/hooks/ask/use-ask-run';
import { useAskStatus } from '@/hooks/ask/use-ask-status';
import {
  AskContext,
  type AskDropInput,
  type AskInput,
  type AskContextValue,
  type AskHistoryEntry,
  type AskPreview,
  type ThreadItem,
} from './ask-context';

/**
 * Ask VCFO state (U3): open flag, the thread and the conversation id live here,
 * above the routed page, so navigating keeps the panel as it was. The
 * conversation id is also kept in sessionStorage so a reload resumes it.
 *
 * The past-chat list (owner item F4) comes from `GET /api/ask/conversations` through React
 * Query. localStorage (`vcfo.ask.history.<userId>`) is only the offline fallback: it is still
 * written when an answer arrives, and read when the server list cannot load.
 */

let seq = 0;
const nextId = () => `a${Date.now().toString(36)}${(seq += 1)}`;

function storageKey(shell: AskShell | null, engagementId: string | null) {
  return `vcfo.ask.conv.${shell ?? 'none'}.${engagementId ?? 'firm'}`;
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: resume simply won't survive a reload.
  }
}

/** Stored messages as thread items: a saved answer shows as an answer, anything else as a question. */
function toThread(messages: StoredMessage[]): ThreadItem[] {
  return messages.map((m) =>
    m.sender === 'user' || !m.answer
      ? { id: m.id, kind: 'user' as const, text: m.text }
      : { id: m.id, kind: 'assistant' as const, messageId: m.id, answer: m.answer },
  );
}

const HISTORY_MAX = 40;
const ECHO_MAX = 1_000;

function historyKey(userId: string | null | undefined) {
  return `vcfo.ask.history.${userId ?? 'anon'}`;
}

function readHistory(key: string): AskHistoryEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as AskHistoryEntry[]).filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, list: AskHistoryEntry[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    // Storage blocked: the chat list lasts for this page load only.
  }
}

export function AskProvider({ children }: { children: ReactNode }) {
  const { user, engagements } = useApp();
  const role = user?.role ?? null;
  const { enabled, firmName, features } = useAskStatus(role);
  const [open, setOpenState] = useState(false);
  const [preview, setPreviewState] = useState<AskPreview | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [handoffDraft, setHandoffDraft] = useState<string | null>(null);
  const [backPill, setBackPill] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  /** A drop the background job is working on in this conversation (null when none). */
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [allHistory, setAllHistory] = useState<AskHistoryEntry[]>([]);
  const hKey = historyKey(user?.id);
  useEffect(() => setAllHistory(readHistory(hKey)), [hKey]);
  const abortRef = useRef<AbortController | null>(null);

  const shell: AskShell | null = useMemo(() => {
    if (!role || !canUseAsk(role)) return null;
    if (role === 'super_admin' && preview) return 'client';
    return defaultShellForRole(role);
  }, [role, preview]);

  const engagementId = useMemo(() => {
    if (shell !== 'client') return null;
    if (preview) return preview.engagementId;
    if (!user) return null;
    return findEngagementForClientUser(engagements, user)?.id ?? engagements[0]?.id ?? null;
  }, [shell, preview, engagements, user]);

  const key = storageKey(shell, engagementId);
  const localHistory = useMemo(
    () => allHistory.filter((e) => e.scope === key).sort((a, b) => b.at.localeCompare(a.at)),
    [allHistory, key],
  );

  const queryClient = useQueryClient();
  const listKey = useMemo(() => ['ask', 'conversations', user?.id ?? null, shell, engagementId] as const, [user?.id, shell, engagementId]);
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchConversationList({ shell: shell!, engagementId }),
    enabled: enabled && shell !== null && (shell !== 'client' || Boolean(engagementId)),
    staleTime: 30_000,
    retry: false,
  });
  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: listKey });
  }, [queryClient, listKey]);

  /** Server list first; localStorage only when the server list is not there (offline, error). */
  const history = useMemo<AskHistoryEntry[]>(() => {
    if (!listQuery.data) return localHistory;
    return listQuery.data.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      at: c.updatedAt,
      scope: key,
      messageCount: c.messageCount,
    }));
  }, [listQuery.data, localHistory, key]);

  /** Adds a chat to the list, or moves it to the top; the first question stays its title. */
  const remember = useCallback(
    (id: string, title: string) => {
      setAllHistory((list) => {
        const old = list.find((e) => e.id === id);
        const entry: AskHistoryEntry = { id, title: old?.title ?? title.slice(0, 120), at: new Date().toISOString(), scope: key };
        const next = [entry, ...list.filter((e) => e.id !== id)];
        writeHistory(hKey, next);
        return next;
      });
    },
    [key, hKey],
  );

  // A different shell / engagement is a different conversation.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    abortRef.current?.abort();
    setThread([]);
    setStatus(null);
    setBusy(false);
    setActiveRunId(null);
    setConversationId(readSession(key));
  }, [key]);

  useEffect(() => {
    setConversationId(readSession(key));
    try {
      setOpenState(window.sessionStorage.getItem('vcfo.ask.open') === '1');
    } catch {
      // Storage blocked — the panel just starts closed.
    }
    // Only on mount; the key effect above handles later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume a stored conversation the first time the panel shows it.
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!(open || pageOpen) || !enabled || !conversationId || thread.length > 0 || hydrated.current === conversationId) return;
    hydrated.current = conversationId;
    fetchConversation(conversationId)
      .then(({ messages, activeRunId: running }) => {
        setThread(toThread(messages));
        // A drop still working in the background: pick its progress poll back up.
        setActiveRunId(running ?? null);
      })
      .catch(() => {
        // Gone or not ours: start fresh, and drop it from the chat list.
        writeSession(key, null);
        setAllHistory((list) => {
          const next = list.filter((e) => e.id !== conversationId);
          writeHistory(hKey, next);
          return next;
        });
        setConversationId(null);
      });
  }, [open, pageOpen, enabled, conversationId, thread.length, key, hKey]);

  // A link such as a manager's notification opens one review card in the chat.
  useEffect(() => {
    if (!enabled) return;
    const changesetId = new URLSearchParams(window.location.search).get('changeset');
    if (!changesetId) return;
    setThread((t) => (t.some((item) => item.kind === 'changeset' && item.changesetId === changesetId) ? t : [...t, { id: nextId(), kind: 'changeset', changesetId }]));
    setOpenState(true);
  }, [enabled]);

  // The drop's progress. When the job stops working (cards ready, a question, done or failed), the
  // thread is read again from the server so the closing answer and its cards appear. A chat
  // message still streaming is left to finish first, so its bubble is not lost.
  const runQuery = useAskRun(activeRunId);
  const run = activeRunId ? (runQuery.data ?? null) : null;
  const runSettled = Boolean(activeRunId) && ((runQuery.data && !isRunActive(runQuery.data)) || runQuery.isError);
  const conversationRef = useRef(conversationId);
  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    if (!runSettled || busy) return;
    const cid = conversationId;
    setActiveRunId(null);
    if (!cid) return;
    fetchConversation(cid)
      .then(({ messages }) => {
        // Only when the person is still on the same chat.
        if (conversationRef.current === cid) setThread(toThread(messages));
        refreshList();
      })
      .catch(() => {
        if (conversationRef.current !== cid) return;
        setThread((t) => [...t, { id: nextId(), kind: 'error', text: 'The files were worked through, but the answer could not be loaded. Open the chat again to see it.' }]);
      });
  }, [runSettled, busy, conversationId, refreshList]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (next) setBackPill(false);
    try {
      window.sessionStorage.setItem('vcfo.ask.open', next ? '1' : '0');
    } catch {
      // Storage blocked — open state is per page load only.
    }
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const setPreview = useCallback((next: AskPreview | null) => setPreviewState(next), []);

  const ask = useCallback(
    async (input: AskInput) => {
      if (!shell || busy) return;
      if (shell === 'client' && !engagementId) return;
      const text = input.message ?? input.label ?? (input.context ? `What's this: ${input.context.label}?` : '');
      if (!text) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      // A long paste shows as a short, masked line; the card below it holds what matters.
      setThread((t) => [...t, { id: nextId(), kind: 'user', text: maskIdentityNumbers(text).slice(0, ECHO_MAX) }]);
      setBusy(true);
      setStatus(null);
      try {
        await streamChat(
          {
            conversationId: conversationId ?? undefined,
            shell,
            engagementId: engagementId ?? undefined,
            message: input.message,
            suggestionId: input.suggestionId,
            context: input.context,
            depth: input.depth,
            attachmentIds: input.attachmentIds,
            page: shell === 'client' ? undefined : { path: window.location.pathname },
          },
          (event) => {
            if (event.type === 'status' || event.type === 'progress') setStatus(event.label);
            else if (event.type === 'run') return;
            else if (event.type === 'answer') {
              setConversationId(event.conversationId);
              writeSession(key, event.conversationId);
              hydrated.current = event.conversationId;
              remember(event.conversationId, text);
              refreshList();
              setThread((t) => [
                ...t,
                { id: nextId(), kind: 'assistant', messageId: event.messageId || null, answer: event.answer },
              ]);
            } else {
              setThread((t) => [...t, { id: nextId(), kind: 'error', text: event.message }]);
            }
          },
          controller.signal,
        );
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          setThread((t) => [
            ...t,
            { id: nextId(), kind: 'error', text: (error as Error)?.message || 'Ask VCFO is unavailable right now.' },
          ]);
        }
      } finally {
        if (abortRef.current === controller) {
          setBusy(false);
          setStatus(null);
        }
      }
    },
    [shell, busy, engagementId, conversationId, key, remember, refreshList],
  );

  const sendDrop = useCallback(
    async (input: AskDropInput) => {
      if (!shell || shell === 'client' || busy || input.files.length === 0) return null;
      const count = input.files.length;
      const text = input.message?.trim() || `Dropped ${count} file${count === 1 ? '' : 's'}`;
      abortRef.current?.abort();
      abortRef.current = null;
      setThread((t) => [...t, { id: nextId(), kind: 'user', text: maskIdentityNumbers(text).slice(0, ECHO_MAX) }]);
      setBusy(true);
      setStatus(`Uploading ${count} file${count === 1 ? '' : 's'}…`);
      try {
        const drop = await createAskDrop(conversationId);
        setConversationId(drop.conversationId);
        writeSession(key, drop.conversationId);
        hydrated.current = drop.conversationId;
        remember(drop.conversationId, text);
        const uploaded = await uploadDrop(drop.dropId, input.files, input.onProgress);
        if (uploaded.uploaded.length === 0) {
          setThread((t) => [...t, { id: nextId(), kind: 'error', text: 'None of these files could be uploaded, so nothing was started.' }]);
          return uploaded.failed;
        }
        setStatus('Starting…');
        const started = await startAskDrop(drop.dropId, {
          message: input.message?.trim() || undefined,
          page: { path: window.location.pathname },
        });
        setActiveRunId(started.runId);
        refreshList();
        return uploaded.failed;
      } catch (error) {
        setThread((t) => [...t, { id: nextId(), kind: 'error', text: (error as Error)?.message || 'Could not send these files.' }]);
        return null;
      } finally {
        setBusy(false);
        setStatus(null);
      }
    },
    [shell, busy, conversationId, key, remember, refreshList],
  );

  const showTopic = useCallback(
    async (slug: string, depth?: AnswerDepth, label?: string) => {
      if (label) setThread((t) => [...t, { id: nextId(), kind: 'user', text: label }]);
      try {
        // The server saves the question and the answer into the conversation (owner item F4).
        const saved = await recordTopicAnswer(slug, {
          depth,
          engagementId: shell === 'client' ? engagementId : null,
          conversationId,
          question: label,
        });
        if (saved.conversationId) {
          setConversationId(saved.conversationId);
          writeSession(key, saved.conversationId);
          hydrated.current = saved.conversationId;
          remember(saved.conversationId, label ?? saved.topic.title);
          refreshList();
        }
        setThread((t) => [...t, { id: nextId(), kind: 'assistant', messageId: saved.messageId, answer: saved.answer }]);
      } catch (error) {
        setThread((t) => [
          ...t,
          { id: nextId(), kind: 'error', text: (error as Error)?.message || 'Could not load this explanation.' },
        ]);
      }
    },
    [shell, engagementId, conversationId, key, remember, refreshList],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setThread([]);
    setStatus(null);
    setBusy(false);
    setActiveRunId(null);
    setConversationId(null);
    writeSession(key, null);
    refreshList();
  }, [key, refreshList]);

  const openConversation = useCallback(
    (id: string) => {
      if (id === conversationId && thread.length > 0) return;
      abortRef.current?.abort();
      setThread([]);
      setStatus(null);
      setBusy(false);
      setHandoffDraft(null);
      setActiveRunId(null);
      hydrated.current = null;
      setConversationId(id);
      writeSession(key, id);
    },
    [conversationId, thread.length, key],
  );

  const value = useMemo<AskContextValue>(
    () => ({
      enabled: enabled && shell !== null,
      firmName,
      features: features ?? {},
      open: open && enabled,
      setOpen,
      toggle,
      shell,
      engagementId,
      preview,
      setPreview,
      thread,
      status,
      busy,
      conversationId,
      ask,
      sendDrop,
      activeRunId,
      run,
      showTopic,
      reset,
      history,
      openConversation,
      pageOpen,
      setPageOpen,
      handoffDraft,
      setHandoffDraft,
      backPill,
      setBackPill,
    }),
    [enabled, firmName, features, open, setOpen, toggle, shell, engagementId, preview, setPreview, thread, status, busy, conversationId, ask, sendDrop, activeRunId, run, showTopic, reset, history, openConversation, pageOpen, handoffDraft, backPill],
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
