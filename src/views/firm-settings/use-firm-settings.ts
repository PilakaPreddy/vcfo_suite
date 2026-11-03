'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import type { FirmSettings, FirmSettingsPatch } from '@/lib/firm-settings/firm-settings';

/** One row of the settings history (the `firm_settings.*` audit events). */
export interface FirmSettingsHistoryRow {
  id: string;
  at: string;
  who: string | null;
  summary: string;
}

const FIRM_SETTINGS_QUERY_KEY = ['firm-settings'] as const;

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/**
 * The firm settings read, the field save and the logo upload, for the Firm settings page.
 * Every save goes through `/api/firm-settings`, which writes one audit event per change.
 */
export function useFirmSettings() {
  const queryClient = useQueryClient();
  // Bumped after each logo change so the <img> asks for the new bytes.
  const [logoVersion, setLogoVersion] = useState(() => Date.now());

  const query = useQuery({
    queryKey: FIRM_SETTINGS_QUERY_KEY,
    queryFn: async () =>
      readJson<{ settings: FirmSettings; history: FirmSettingsHistoryRow[] }>(await fetch('/api/firm-settings')),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (patch: FirmSettingsPatch) =>
      readJson<{ settings: FirmSettings; changed: string[] }>(
        await fetch('/api/firm-settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      ),
    onSuccess: async (data) => {
      if (data.changed.length > 0) toastSuccess('Saved');
      await queryClient.invalidateQueries({ queryKey: FIRM_SETTINGS_QUERY_KEY });
    },
    onError: (err) => toastError('Could not save', errorMessage(err)),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return readJson<{ ok: true }>(await fetch('/api/firm-settings/logo', { method: 'POST', body: form }));
    },
    onSuccess: async () => {
      setLogoVersion(Date.now());
      toastSuccess('Logo updated');
      await queryClient.invalidateQueries({ queryKey: FIRM_SETTINGS_QUERY_KEY });
    },
    onError: (err) => toastError('Could not upload the logo', logoError(err)),
  });

  const removeLogo = useMutation({
    mutationFn: async () => readJson<{ ok: true }>(await fetch('/api/firm-settings/logo', { method: 'DELETE' })),
    onSuccess: async () => {
      setLogoVersion(Date.now());
      await queryClient.invalidateQueries({ queryKey: FIRM_SETTINGS_QUERY_KEY });
    },
    onError: (err) => toastError('Could not remove the logo', errorMessage(err)),
  });

  return {
    query,
    settings: query.data?.settings ?? null,
    history: query.data?.history ?? [],
    save,
    uploadLogo,
    removeLogo,
    logoSrc: `/api/firm-settings/logo?v=${logoVersion}`,
  };
}

function logoError(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (raw === 'file_too_large') return 'The file is over 2 MB.';
  if (raw === 'unsupported_type') return 'Use a PNG, JPEG, WebP or GIF file.';
  return errorMessage(err);
}
