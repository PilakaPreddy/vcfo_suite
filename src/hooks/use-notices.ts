'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoticeAuthority, NoticeStage } from '@/lib/notices/model';

const KEY = 'notices';

/** One case on the notice desk, as GET /api/notices returns it (NoticeCaseDto). */
export interface NoticeCase {
  id: string;
  engagementId: string;
  companyName: string;
  authority: NoticeAuthority;
  section: string | null;
  periodLabel: string | null;
  din: string | null;
  demandAmount: string | null;
  receivedOn: string | null;
  responseDueOn: string | null;
  hearingOn: string | null;
  daysLeft: number | null;
  stage: NoticeStage;
  open: boolean;
  ownerId: string | null;
  ownerName: string | null;
  summary: string | null;
  replyDraft: string | null;
  documentsNeeded: string[];
  requestListId: string | null;
  attachments: Array<{ documentId: string; fileName: string }>;
  notes: string | null;
  label: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The fields the notice reader filled, as POST /api/notices/read returns them. */
export interface NoticeFields {
  authority: NoticeAuthority;
  section: string | null;
  periodLabel: string | null;
  din: string | null;
  demandAmount: string | null;
  receivedOn: string | null;
  responseDueOn: string | null;
  hearingOn: string | null;
  summary: string | null;
}

export interface NoticeReview {
  title: string;
  tier: string;
  summary: string;
  checks: Array<{ rule: string; ok: boolean; message?: string }>;
  heldReason: string | null;
  recipients?: Array<{ name: string; email: string }>;
}

async function json<T>(res: Response): Promise<T> {
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(out.error ?? String(res.status)), { body: out });
  return out;
}

/** Every case in the caller's scope (GET /api/notices), the soonest reply date first. */
export function useNotices() {
  return useQuery({
    queryKey: [KEY],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<NoticeCase[]> => (await json<{ items: NoticeCase[] }>(await fetch('/api/notices', { cache: 'no-store' }))).items ?? [],
  });
}

export interface ReadNoticeAnswer {
  attachmentId: string;
  fileName: string;
  fields?: NoticeFields;
  usedModel?: boolean;
  review?: NoticeReview;
  error?: string;
}

/** Uploads and reads a notice; a read that fails still returns the attachment, to fill by hand. */
export async function readNoticeFile(engagementId: string, file: File): Promise<ReadNoticeAnswer> {
  const form = new FormData();
  form.set('file', file);
  form.set('engagementId', engagementId);
  const res = await fetch('/api/notices/read', { method: 'POST', body: form });
  const out = (await res.json().catch(() => ({}))) as ReadNoticeAnswer;
  if (!res.ok && !out.attachmentId) throw new Error(out.error ?? 'The notice was not uploaded.');
  return out;
}

export type OpenNoticeBody = Partial<Omit<NoticeFields, 'authority'>> & { engagementId: string; attachmentId?: string; authority: NoticeAuthority; value: string };

/** The approval click on the intake review: POST /api/notices runs compliance.openNotice. */
export function useOpenNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: OpenNoticeBody) => json<{ summary: string; href?: string }>(await fetch('/api/notices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, confirm: true }) })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export type NoticePatch = Partial<Pick<NoticeCase, 'authority' | 'section' | 'periodLabel' | 'din' | 'demandAmount' | 'receivedOn' | 'responseDueOn' | 'hearingOn' | 'stage' | 'ownerId' | 'summary' | 'replyDraft' | 'documentsNeeded' | 'notes'>>;

export function useUpdateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: NoticePatch }) =>
      (await json<{ item: NoticeCase }>(await fetch(`/api/notices/${encodeURIComponent(input.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input.patch) }))).item,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDraftNoticeReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => json<{ summary: string; item: NoticeCase | null }>(await fetch(`/api/notices/${encodeURIComponent(id)}/draft`, { method: 'POST' })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export async function fetchDocumentsReview(id: string): Promise<NoticeReview> {
  return (await json<{ review: NoticeReview }>(await fetch(`/api/notices/${encodeURIComponent(id)}/request-documents`, { cache: 'no-store' }))).review;
}

export function useRequestNoticeDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; dueAt?: string }) =>
      json<{ summary: string }>(
        await fetch(`/api/notices/${encodeURIComponent(input.id)}/request-documents`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: true, ...(input.dueAt ? { dueAt: input.dueAt } : {}) }),
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
