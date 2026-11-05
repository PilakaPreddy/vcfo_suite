'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NocState } from '@/lib/noc/state';
import type { DocStageRecords } from '@/components/board-doc';

export interface NocVersionRow {
  version: number;
  variant: string;
  createdAt: string;
  byName?: string;
  fields: Record<string, string>;
}

export type NocAction =
  | { action: 'check'; key: string; ticked: boolean }
  | { action: 'accept' }
  | { action: 'send_back'; reason: string }
  | { action: 'change_template'; variant: string; reason: string }
  | { action: 'notary_steps'; off: boolean };

/** Plain words for the route's error codes (R-05: no "please", no "successfully"). */
const ERROR_TEXT: Record<string, string> = {
  checks_incomplete: 'Tick every check before you accept.',
  reason_required: 'Write a reason.',
  no_signed_copy: 'No signed copy yet.',
  already_accepted: 'The signed copy is already accepted.',
  not_foreign_parent: 'Only a foreign parent has the notary steps.',
  unknown_variant: 'Choose a template.',
};

function nocErrorText(code: string): string {
  return ERROR_TEXT[code] ?? code;
}

/**
 * The board resolution (NOC) state for the staff page: `GET .../board-resolution/noc`, the staff
 * actions (POST) and the versions for Compare versions. `refreshKey` reloads it when the document
 * changes (a new draft, a release, a signed upload).
 */
export function useNocState(engagementId: string | undefined, refreshKey: string) {
  const [noc, setNoc] = useState<NocState | null>(null);
  const [busy, setBusy] = useState<NocAction['action'] | null>(null);

  const load = useCallback(async () => {
    if (!engagementId) return;
    try {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/board-resolution/noc`, { cache: 'no-store' });
      const out = (await res.json().catch(() => ({}))) as { noc?: NocState };
      if (res.ok && out.noc) setNoc(out.noc);
    } catch {
      /* The staff cards stay hidden when the state cannot load. */
    }
  }, [engagementId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const act = useCallback(
    async (body: NocAction): Promise<NocState> => {
      if (!engagementId) throw new Error('No project');
      setBusy(body.action);
      try {
        const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/board-resolution/noc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const out = (await res.json().catch(() => ({}))) as { noc?: NocState; error?: string };
        if (!res.ok || !out.noc) throw new Error(nocErrorText(out.error || 'Could not save'));
        setNoc(out.noc);
        return out.noc;
      } finally {
        setBusy(null);
      }
    },
    [engagementId],
  );

  const loadVersions = useCallback(async (): Promise<NocVersionRow[]> => {
    if (!engagementId) return [];
    const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/board-resolution/versions`, { cache: 'no-store' });
    const out = (await res.json().catch(() => ({}))) as { versions?: NocVersionRow[]; error?: string };
    if (!res.ok) throw new Error(out.error || 'Could not load the versions');
    return out.versions ?? [];
  }, [engagementId]);

  return { noc, busy, act, reload: load, loadVersions };
}

/** The NOC track records for the shared track part, from the one stored record (P2). */
export function nocRecords(noc: NocState): DocStageRecords {
  const out: DocStageRecords = {};
  for (const s of noc.track) out[s.key] = s.done ? { at: s.at ?? null, by: s.byName ?? null } : undefined;
  return out;
}
