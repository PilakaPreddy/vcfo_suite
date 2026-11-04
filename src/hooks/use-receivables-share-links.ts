'use client';

/**
 * Receivables shared views (Phase 10, docs/specs/receivables/PLAN.md): TanStack Query over the
 * share link routes. Shapes are in src/lib/receivables/share-wire.ts. Each write refetches the
 * sheet's link list, so the Links tab and the dialog stay in step.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShareLinkDto, ShareLinkInput, ShareLinkPatch } from '@/lib/receivables/share-wire';

const ERROR_TEXT: Record<string, string> = {
  name: 'Give the link a name of up to 120 characters.',
  visibility: 'Pick who may open the link.',
  allowed_emails: 'Add at least one valid email, up to 50.',
  expires_at: 'Pick an expiry date in the future.',
  revoked: 'This link is revoked. Create a new one instead.',
  not_found: 'This sheet or link is not assigned to you.',
  Forbidden: 'Your role cannot share receivables.',
};

export class ShareLinkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ShareLinkApiError((body.error && ERROR_TEXT[body.error]) || body.error || 'Something went wrong. Try again.', res.status, body.error);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const shareLinksKey = (sheetId: string) => ['receivables', 'share-links', sheetId] as const;

export function useShareLinks(sheetId: string, enabled = true) {
  return useQuery({
    queryKey: shareLinksKey(sheetId),
    queryFn: async () => (await call<{ links: ShareLinkDto[] }>(`/api/receivables/sheets/${sheetId}/share-links`)).links,
    enabled: enabled && Boolean(sheetId),
  });
}

export function useShareLinkActions(sheetId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: shareLinksKey(sheetId) });
  return {
    create: useMutation({
      mutationFn: async (input: ShareLinkInput) => (await call<{ link: ShareLinkDto }>(`/api/receivables/sheets/${sheetId}/share-links`, json('POST', input))).link,
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...patch }: ShareLinkPatch & { id: string }) => (await call<{ link: ShareLinkDto }>(`/api/receivables/share-links/${id}`, json('PATCH', patch))).link,
      onSettled: refresh,
    }),
    revoke: useMutation({
      mutationFn: async (id: string) => (await call<{ link: ShareLinkDto }>(`/api/receivables/share-links/${id}`, json('DELETE'))).link,
      onSettled: refresh,
    }),
  };
}
