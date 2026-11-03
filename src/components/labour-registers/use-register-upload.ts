'use client';

import { useCallback, useState } from 'react';
import type { SlotKey, SlotState } from './UploadCard';

/**
 * Uploading one input of a batch.
 *
 * Deliberately simpler than `useMultiUpload`, which the client portal uses: a register input is
 * one file per slot, replaced rather than queued, so there is no batch, no tray and no partial
 * -batch case to report. What there is instead is the reader's answer — which sheet it chose,
 * which row the headings were on, how many rows it found — because a payroll workbook has
 * thirteen sheets and a title row, and "it uploaded" is not the useful signal.
 *
 * Progress is not reported. These files are a few hundred kilobytes and the server has to parse
 * the workbook before it answers, so a progress bar would sit at 100% for most of the wait and
 * mislead. "Reading…" is the honest state.
 */

export interface RegisterUploadState {
  uploads: Partial<Record<SlotKey, SlotState>>;
  busySlot: SlotKey | null;
  errors: Partial<Record<SlotKey, string>>;
  upload: (slot: SlotKey, file: File) => Promise<void>;
}

interface UploadAnswer {
  upload?: { id: string; slot: SlotKey; fileName: string; rowCount: number };
  parsed?: { sheetName: string; headerRow: number; headers: string[]; rowCount: number; grid?: { days?: unknown[] } };
  error?: string;
}

export function useRegisterUpload(
  batchId: string,
  initial: Partial<Record<SlotKey, SlotState>> = {},
): RegisterUploadState {
  const [uploads, setUploads] = useState(initial);
  const [busySlot, setBusySlot] = useState<SlotKey | null>(null);
  const [errors, setErrors] = useState<Partial<Record<SlotKey, string>>>({});

  const upload = useCallback(
    async (slot: SlotKey, file: File) => {
      setBusySlot(slot);
      setErrors((e) => ({ ...e, [slot]: undefined }));

      const body = new FormData();
      body.append('batchId', batchId);
      body.append('slot', slot);
      body.append('file', file);

      try {
        const res = await fetch('/api/labour-registers/upload', { method: 'POST', body });
        const answer = (await res.json().catch(() => ({}))) as UploadAnswer;

        if (!res.ok || !answer.upload || !answer.parsed) {
          /* The route's messages are written for a preparer — "No column headings were found in
             that sheet" — so they are shown as they are rather than replaced. */
          setErrors((e) => ({ ...e, [slot]: answer.error ?? 'The upload failed.' }));
          return;
        }

        const { parsed } = answer;
        setUploads((u) => ({
          ...u,
          [slot]: {
            fileName: answer.upload!.fileName,
            rowCount: parsed.rowCount,
            sheetName: parsed.sheetName,
            headerRow: parsed.headerRow,
            gridDays: Array.isArray(parsed.grid?.days) ? parsed.grid.days.length : undefined,
          },
        }));
      } catch {
        setErrors((e) => ({ ...e, [slot]: 'Could not reach the server.' }));
      } finally {
        setBusySlot(null);
      }
    },
    [batchId],
  );

  return { uploads, busySlot, errors, upload };
}
