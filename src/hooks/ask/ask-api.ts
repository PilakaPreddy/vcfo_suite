import type { AnswerDepth, AnswerEnvelope, AskShell, ProjectSnapshot } from '@/data/ask/schema';
import type { ChangesetView } from '@/lib/ask/changeset/view-types';
import type { DropRunView } from '@/lib/ask/drop/types';

/** Browser client for /api/ask/*. Every call surfaces a friendly error message. */

class AskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AskApiError';
  }
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error bodies fall through to the fallback message.
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : fallback;
    throw new AskApiError(message, res.status);
  }
  return body as T;
}

export type AskStatus = { enabled: boolean; firmName: string; features?: Partial<Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'A1', boolean>> };

export async function fetchAskStatus(): Promise<AskStatus> {
  const res = await fetch('/api/ask/status', { cache: 'no-store' });
  return json<AskStatus>(res, 'Ask VCFO is unavailable');
}

export type SuggestionView = { id: string; group: string; label: string };

export async function fetchSuggestions(
  shell: AskShell,
  engagementId: string | null,
): Promise<{ suggestions: SuggestionView[]; snapshot: ProjectSnapshot | null }> {
  const params = new URLSearchParams({ shell });
  if (engagementId) params.set('engagementId', engagementId);
  const res = await fetch(`/api/ask/suggestions?${params}`);
  return json(res, 'Could not load suggestions');
}

export async function fetchTopicAnswer(
  slug: string,
  opts: { depth?: AnswerDepth; engagementId?: string | null },
): Promise<{ topic: { slug: string; title: string; category: string; version: number }; answer: AnswerEnvelope }> {
  const params = new URLSearchParams();
  if (opts.depth) params.set('depth', opts.depth);
  if (opts.engagementId) params.set('engagementId', opts.engagementId);
  const res = await fetch(`/api/ask/topics/${encodeURIComponent(slug)}?${params}`);
  return json(res, 'Could not load this explanation');
}

export type ChatBody = {
  conversationId?: string;
  shell: AskShell;
  engagementId?: string;
  message?: string;
  suggestionId?: string;
  context?: { kind: 'step' | 'field' | 'compliance' | 'document'; ref: string; label: string };
  depth?: AnswerDepth;
  attachmentIds?: string[];
  page?: { path: string };
};

export type ChatEvent =
  | { type: 'status'; label: string }
  | { type: 'progress'; runId: string; label: string }
  | { type: 'run'; runId: string; status: string }
  | { type: 'answer'; conversationId: string; messageId: string; answer: AnswerEnvelope }
  | { type: 'error'; code: string; message: string };

/** POST /api/ask/chat and read the NDJSON stream event by event. */
export async function streamChat(body: ChatBody, onEvent: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/ask/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    await json(res, 'Ask VCFO is unavailable right now');
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as ChatEvent);
        } catch {
          // A malformed line is skipped; the stream keeps going.
        }
      }
      newline = buffer.indexOf('\n');
    }
  }
}

export type StoredMessage = { id: string; sender: 'user' | 'assistant'; text: string; answer: AnswerEnvelope | null };

/** `activeRunId` is a drop still working in the background, so a reopened panel resumes its poll. */
export async function fetchConversation(id: string): Promise<{ messages: StoredMessage[]; activeRunId?: string | null }> {
  const res = await fetch(`/api/ask/conversations/${encodeURIComponent(id)}`);
  return json(res, 'Could not load the conversation');
}

export type ConversationSummaryView = { id: string; title: string; updatedAt: string; messageCount: number };

/** GET /api/ask/conversations: the caller's own chats, newest first, 40 per page (owner item F4). */
export async function fetchConversationList(opts: {
  shell: AskShell;
  engagementId: string | null;
  page?: number;
}): Promise<{ conversations: ConversationSummaryView[]; hasMore: boolean }> {
  const params = new URLSearchParams({ shell: opts.shell });
  if (opts.engagementId) params.set('engagementId', opts.engagementId);
  if (opts.page) params.set('page', String(opts.page));
  const res = await fetch(`/api/ask/conversations?${params}`, { cache: 'no-store' });
  return json(res, 'Could not load your chats');
}

/**
 * POST /api/ask/topics/[slug]: the same answer as fetchTopicAnswer, and the server saves the
 * question and the answer into the conversation. `conversationId` is null when the save failed.
 */
export async function recordTopicAnswer(
  slug: string,
  body: { depth?: AnswerDepth; engagementId?: string | null; conversationId?: string | null; question?: string },
): Promise<{
  topic: { slug: string; title: string; category: string; version: number };
  answer: AnswerEnvelope;
  conversationId: string | null;
  messageId: string | null;
}> {
  const res = await fetch(`/api/ask/topics/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      depth: body.depth,
      engagementId: body.engagementId ?? undefined,
      conversationId: body.conversationId ?? undefined,
      question: body.question,
    }),
  });
  return json(res, 'Could not load this explanation');
}

export type LibraryItemView = {
  id: string;
  title: string;
  category: string;
  topicSlug: string | null;
  updated: boolean;
  savedAt: string;
  answer: AnswerEnvelope;
};

export async function saveToLibrary(body: {
  engagementId: string;
  topicSlug?: string;
  messageId?: string;
  answer?: AnswerEnvelope;
}): Promise<{ item: LibraryItemView }> {
  const res = await fetch('/api/ask/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res, 'Could not save to your library');
}

export async function fetchLibrary(): Promise<{ items: LibraryItemView[] }> {
  return json(await fetch('/api/ask/library'), 'Could not load your library');
}

export async function fetchLibraryItem(id: string): Promise<{ item: LibraryItemView; notice: string | null }> {
  return json(await fetch(`/api/ask/library/${encodeURIComponent(id)}`), 'Could not open this item');
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await json(await fetch(`/api/ask/library/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Could not remove this item');
}

export async function sendHandoff(body: {
  engagementId: string;
  question: string;
  conversationId?: string;
  context?: string;
}): Promise<void> {
  const res = await fetch('/api/ask/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await json(res, 'Could not send your question. Please try again.');
}

/** One file being uploaded, as the composer shows it. */
export type UploadProgress = {
  path: string;
  loaded: number;
  total: number;
  status: 'waiting' | 'uploading' | 'done' | 'failed';
  error?: string;
};

export type UploadResult = {
  uploaded: Array<{ id: string; fileName: string; path: string }>;
  failed: Array<{ path: string; reason: string }>;
};

/** How many files go up at once. */
const UPLOAD_PARALLEL = 4;

/** One multipart POST through XMLHttpRequest, because fetch does not report upload progress. */
function postWithProgress(form: FormData, onProgress: (loaded: number) => void): Promise<{ id: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ask/attachments');
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onerror = () => reject(new AskApiError('The upload stopped. Check the connection and try again.', 0));
    xhr.onload = () => {
      let body: { id?: unknown; fileName?: unknown; error?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        // A non-JSON body falls through to the fallback message.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body.id === 'string') {
        resolve({ id: body.id, fileName: typeof body.fileName === 'string' ? body.fileName : '' });
        return;
      }
      reject(new AskApiError(body && typeof body.error === 'string' ? body.error : 'Could not attach this file.', xhr.status));
    };
    xhr.send(form);
  });
}

/**
 * Uploads files four at a time and reports each file's progress. With a `dropId` every file joins
 * that drop with its folder path; without one the files are plain chat attachments for the next
 * message. A refused file does not stop the others: it comes back in `failed` with the reason.
 */
export async function uploadAskFiles(
  files: Array<{ file: File; path: string }>,
  opts: { dropId?: string; onProgress?: (progress: UploadProgress[]) => void } = {},
): Promise<UploadResult> {
  const progress: UploadProgress[] = files.map((f) => ({ path: f.path, loaded: 0, total: f.file.size, status: 'waiting' }));
  const report = () => opts.onProgress?.(progress.map((p) => ({ ...p })));
  const result: UploadResult = { uploaded: [], failed: [] };
  const done: Array<UploadResult['uploaded'][number] | null> = files.map(() => null);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const index = next;
      next += 1;
      const { file, path } = files[index]!;
      const form = new FormData();
      form.set('file', file);
      if (opts.dropId) {
        form.set('dropId', opts.dropId);
        if (path !== file.name) form.set('relativePath', path);
      }
      progress[index] = { ...progress[index]!, status: 'uploading' };
      report();
      try {
        const added = await postWithProgress(form, (loaded) => {
          progress[index] = { ...progress[index]!, loaded: Math.min(loaded, file.size) };
          report();
        });
        done[index] = { id: added.id, fileName: added.fileName || file.name, path };
        progress[index] = { ...progress[index]!, loaded: file.size, status: 'done' };
      } catch (error) {
        const reason = (error as Error).message || 'Could not attach this file.';
        result.failed.push({ path, reason });
        progress[index] = { ...progress[index]!, status: 'failed', error: reason };
      }
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_PARALLEL, files.length) }, worker));
  // Keep the order the person chose, whatever order the uploads finished in.
  result.uploaded = done.filter((d): d is UploadResult['uploaded'][number] => d !== null);
  return result;
}

/** POST /api/ask/drops: opens a drop in the given conversation, or in a new one. */
export async function createAskDrop(conversationId?: string | null): Promise<{ dropId: string; conversationId: string }> {
  const res = await fetch('/api/ask/drops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversationId ? { conversationId } : {}),
  });
  return json(res, 'Could not start the drop.');
}

/** Uploads a drop's files into it, four at a time, with progress for each file. */
export function uploadDrop(
  dropId: string,
  files: Array<{ file: File; path: string }>,
  onProgress?: (progress: UploadProgress[]) => void,
): Promise<UploadResult> {
  return uploadAskFiles(files, { dropId, onProgress });
}

/** POST /api/ask/drops/:id/start: sends the drop to the background job with the person's message. */
export async function startAskDrop(dropId: string, body: { message?: string; page?: { path: string } }): Promise<{ runId: string }> {
  const res = await fetch(`/api/ask/drops/${encodeURIComponent(dropId)}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res, 'Could not start working on these files.');
}

/** GET /api/ask/runs/:id: a drop's progress, files and review cards. */
export async function fetchAskRun(id: string): Promise<DropRunView> {
  return json(await fetch(`/api/ask/runs/${encodeURIComponent(id)}`, { cache: 'no-store' }), 'Could not load the progress.');
}

const changesetUrl = (id: string) => `/api/ask/changesets/${encodeURIComponent(id)}`;

export async function fetchChangeset(id: string): Promise<ChangesetView> {
  return json(await fetch(changesetUrl(id), { cache: 'no-store' }), 'Could not load this card.');
}

function sendChangeset(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function editChangesetRow(id: string, rowId: string, value: string): Promise<ChangesetView> {
  return json(await sendChangeset(changesetUrl(id), 'PATCH', { rowId, value }), 'Could not change this value.');
}

export async function decideChangeset(id: string, body: { contentHash: string; accept: string[] } | { reject: true }): Promise<ChangesetView> {
  return json(await sendChangeset(`${changesetUrl(id)}/decide`, 'POST', body), 'Could not save these values.');
}

export async function undoChangeset(id: string): Promise<ChangesetView> {
  return json(await sendChangeset(`${changesetUrl(id)}/undo`, 'POST', {}), 'Could not undo this.');
}
