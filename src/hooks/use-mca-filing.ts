'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FilingForm, FilingPatch } from '@/lib/mca-filing/filing-state';
import type { SignerPortalFacts } from '@/lib/mca-filing/readiness';
import type { AssistAttachmentItem, FilingBundle, PacketSummaryDto, SignatureRequestEntry } from '@/lib/mca-filing/types';

const base = (engagementId: string) => `/api/assist/engagements/${encodeURIComponent(engagementId)}`;

/** A refusal keeps the server's plain sentence, so the card can show it as it is. */
async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Network error. Check your connection.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'The request failed.');
  return body as T;
}

/** The filing record; null while VCFO Assist is turned off on this server. */
export function useMcaFiling(engagementId: string | null | undefined) {
  return useQuery({
    queryKey: ['mca-filing', engagementId ?? ''],
    queryFn: async (): Promise<FilingBundle | null> => {
      const res = await fetch(`${base(engagementId as string)}/filing`);
      if (res.status === 503) return null;
      if (!res.ok) throw new Error('Could not load the MCA filing record.');
      return (await res.json()) as FilingBundle;
    },
    enabled: Boolean(engagementId),
    staleTime: 15_000,
  });
}

export function useAssistAttachments(engagementId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['assist-attachments', engagementId ?? ''],
    queryFn: async () => (await send<{ items: AssistAttachmentItem[] }>(`${base(engagementId as string)}/attachments`)).items,
    enabled: Boolean(engagementId) && enabled,
    staleTime: 30_000,
  });
}

export function useMcaFilingActions(engagementId: string) {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: ['mca-filing', engagementId] });
  const path = base(engagementId);

  const patch = useMutation({
    mutationFn: (input: { form: FilingForm } & FilingPatch) => send(`${path}/filing`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess,
  });
  const upload = useMutation({
    mutationFn: (input: { form: FilingForm; kind: 'portal_pdf' | 'signed_pdf'; file: File }) => {
      const body = new FormData();
      body.append('form', input.form);
      body.append('kind', input.kind);
      body.append('file', input.file);
      return send(`${path}/filing/documents`, { method: 'POST', body });
    },
    onSuccess,
  });
  const review = useMutation({
    mutationFn: (input: { form: FilingForm; note?: string }) => send(`${path}/filing/review`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess,
  });
  const askSignatures = useMutation({
    mutationFn: (input: { form: FilingForm; signerIds?: string[] }) =>
      send<{ requests: SignatureRequestEntry[] }>(`${path}/filing/signature-requests`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess,
  });
  const signerFacts = useMutation({
    mutationFn: (input: { signerId: string } & Partial<SignerPortalFacts>) =>
      send<{ signerId: string; facts: SignerPortalFacts }>(`${path}/filing/signers`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess,
  });
  const freezePacket = useMutation({
    mutationFn: (input: { note?: string }) =>
      send<{ packet: PacketSummaryDto; created: boolean }>(`${path}/filing/packets`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess,
  });
  return { patch, upload, review, askSignatures, signerFacts, freezePacket };
}

/** The URL that downloads one frozen packet as a JSON file. */
export const filingPacketUrl = (engagementId: string, version: number) => `${base(engagementId)}/filing/packets/${version}`;

/** One filing PDF, opened from the base64 route in a new tab. */
export async function openFilingDocument(engagementId: string, documentId: string): Promise<void> {
  const body = await send<{ base64: string }>(`${base(engagementId)}/filing/documents/${encodeURIComponent(documentId)}/file`);
  const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
