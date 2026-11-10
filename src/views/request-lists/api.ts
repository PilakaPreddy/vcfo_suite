'use client';

import type { RequestListDetail, RequestListSummary } from '@/db/repositories/request-lists';

/** Browser calls for the request list page. Types only come from the repository; no db import. */

export type { RequestListDetail, RequestListSummary };

export interface TemplateOption {
  id: string;
  title: string;
  summary: string;
  periodHint: string;
  itemCount: number;
  cadenceDays: number;
}

export interface SendReview {
  title: string;
  tier: string;
  recipients: Array<{ name: string; email?: string; role?: string }>;
  summary: string;
  checks: Array<{ rule: string; ok: boolean; message?: string }>;
  heldReason: string | null;
}

export const REQUEST_LISTS_KEY = ['request-lists'] as const;

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const fetchLists = () => fetch('/api/request-lists', { cache: 'no-store' }).then((r) => json<{ lists: RequestListSummary[]; templates: TemplateOption[] }>(r));
export const fetchList = (id: string) => fetch(`/api/request-lists/${id}`, { cache: 'no-store' }).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const createList = (body: { engagementId: string; templateId?: string; title?: string; periodLabel?: string | null; dueOn?: string | null }) =>
  send('/api/request-lists', 'POST', body).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const patchList = (id: string, body: { cancel?: boolean; dueOn?: string | null; cadenceDays?: number }) =>
  send(`/api/request-lists/${id}`, 'PATCH', body).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const addItem = (id: string, body: { kind: string; label: string; help?: string | null }) =>
  send(`/api/request-lists/${id}/items`, 'POST', body).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const removeItem = (id: string, itemId: string) =>
  send(`/api/request-lists/${id}/items?itemId=${encodeURIComponent(itemId)}`, 'DELETE').then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const answerItem = (id: string, itemId: string, body: { answerText?: string | null; confirmed?: boolean }) =>
  send(`/api/request-lists/${id}/items`, 'PATCH', { action: 'answer', itemId, ...body }).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const reviewItem = (id: string, itemId: string, decision: 'accepted' | 'rejected') =>
  send(`/api/request-lists/${id}/items`, 'PATCH', { action: 'review', itemId, decision }).then((r) => json<{ list: RequestListDetail }>(r)).then((b) => b.list);

export const fetchSendReview = (id: string) => fetch(`/api/request-lists/${id}/send`, { cache: 'no-store' }).then((r) => json<{ review: SendReview }>(r)).then((b) => b.review);

export const confirmSend = (id: string) => send(`/api/request-lists/${id}/send`, 'POST', { confirm: true }).then((r) => json<{ summary: string }>(r));
