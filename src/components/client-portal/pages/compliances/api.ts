'use client';

/**
 * Data for the compliances pages — TanStack Query over the NEW
 * /api/client/compliances routes (repository: client-compliances.ts).
 */
import { sep } from '@/lib/date-format';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todayIso, type PortalFiling } from '@/lib/client-portal/compliances';
import type { ViewerDoc } from '../documents/DocViewer';
import { usePortalOptional } from '../../PortalProvider';

export const COMP_KEY = ['client-compliances'] as const;

/**
 * The engagement staff are viewing through `StaffPortalProvider`, as `&engagement=<id>`; empty
 * for a client (whose own engagement the server always uses) and for staff pages outside it.
 */
export function useEngagementParam(): string {
  const id = usePortalOptional()?.engagementId;
  return id ? `&engagement=${encodeURIComponent(id)}` : '';
}

export function useCompFilings(fy: number, enabled = true) {
  const eng = useEngagementParam();
  return useQuery({
    queryKey: eng ? [...COMP_KEY, fy, eng] : [...COMP_KEY, fy],
    enabled,
    queryFn: async (): Promise<{ rows: PortalFiling[]; today: string }> => {
      const res = await fetch(`/api/client/compliances?fy=${fy}${eng}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { rows?: PortalFiling[]; today?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not load the register');
      return { rows: data.rows ?? [], today: data.today ?? todayIso() };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Every period on the client's register, all years (Obligations list and record). */
export function useAllFilings(enabled = true) {
  return useQuery({
    queryKey: [...COMP_KEY, 'all'],
    enabled,
    queryFn: async (): Promise<{ rows: PortalFiling[]; today: string }> => {
      const res = await fetch('/api/client/compliances', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { rows?: PortalFiling[]; today?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not load the register');
      return { rows: data.rows ?? [], today: data.today ?? todayIso() };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export interface ProofMeta {
  id: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number | null;
  kind: string;
  isPrimary: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
  /** The client uploaded it (G-03); SBC checks it. */
  byClient?: boolean;
}

export function useProofs(filingId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMP_KEY, 'proofs', filingId],
    enabled: Boolean(filingId) && enabled,
    queryFn: async (): Promise<ProofMeta[]> => {
      const res = await fetch(`/api/client/compliances/${filingId}/proofs`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { proofs?: ProofMeta[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not load the proof');
      return data.proofs ?? [];
    },
    staleTime: 60_000,
  });
}

export function proofHref(filingId: string, proofId: string): string {
  return `/api/client/compliances/${filingId}/proofs/${encodeURIComponent(proofId)}`;
}

export async function fetchProofs(filingId: string): Promise<ProofMeta[]> {
  const res = await fetch(`/api/client/compliances/${filingId}/proofs`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load the proof');
  return ((await res.json()) as { proofs: ProofMeta[] }).proofs ?? [];
}

/**
 * G-03: the client adds proof files to one filing. Each file is one POST to the
 * proofs route (the client branch), in order; the result lists what failed so
 * the panel can name each file. The filing's status never changes from here.
 */
export function useAddProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filingId, files }: { filingId: string; files: File[] }) => {
      const done: ProofMeta[] = [];
      const failed: { name: string; error: string }[] = [];
      for (const f of files) {
        const body = new FormData();
        body.append('file', f);
        body.append('kind', /challan/i.test(f.name) ? 'challan' : 'other');
        const res = await fetch(`/api/client/compliances/${filingId}/proofs`, { method: 'POST', body }).catch(() => null);
        const data = (await res?.json().catch(() => ({}))) as { proof?: ProofMeta; error?: string } | undefined;
        if (res?.ok && data?.proof) done.push(data.proof);
        else failed.push({ name: f.name, error: data?.error ?? 'Upload failed' });
      }
      return { done, failed };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: COMP_KEY }),
  });
}

/** Proof files → the shared DocViewer's contract (lazy signed URLs). */
export function viewerDocs(f: PortalFiling, proofs: ProofMeta[]): ViewerDoc[] {
  return proofs.map((p) => ({
    id: `${f.id}:${p.id}`,
    name: p.fileName,
    contentType: p.mime,
    sizeBytes: p.sizeBytes,
    meta: `${f.name} · ${f.period}${f.filedOn ? ` · filed ${sep(new Date(`${f.filedOn}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }))}` : ''}`,
    chip: p.byClient ? { text: 'From you', tone: 'due' as const } : { text: 'Filed', tone: 'ok' as const },
    uploadedAt: p.uploadedAt,
    uploadedBy: p.uploadedBy ?? undefined,
    url: async () => {
      const res = await fetch(`${proofHref(f.id, p.id)}?json=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not open the proof');
      return ((await res.json()) as { url: string }).url;
    },
  }));
}

/** "Remind me" with Undo. */
export function useReminder() {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client/compliances/${id}/reminder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channels: ['email'] }),
      });
      const data = (await res.json().catch(() => ({}))) as { remindOn?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not set the reminder');
      return data.remindOn ?? null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: COMP_KEY }),
  });
  const clear = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client/compliances/${id}/reminder`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove the reminder');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: COMP_KEY }),
  });
  return { set, clear };
}

/** Trigger a file download from a same-origin route. */
export function useDownload() {
  return useCallback((href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);
}
