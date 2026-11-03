'use client';

import { Copy, Download, FileText, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import { stamp } from '../format';

/**
 * Share (Phase 4): the client page link, WhatsApp (opens the manager's own WhatsApp with the
 * message filled in; no WhatsApp API), Email (the Send email box), PDF (the client page in print
 * view) and Excel (the published version).
 */
export function ShareDialog({ data, onClose, onEmail }: { data: ManagerSheetDto; onClose: () => void; onEmail: () => void }) {
  const when = data.latestVersion ? stamp(data.latestVersion.publishedAt) : null;
  const message = `Receivables update from SBC${when ? ` (${when})` : ''}. The live page, always current: ${data.publicUrl}`;
  const printUrl = `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}print=1`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.publicUrl);
      toastSuccess('Client link copied', data.publicUrl);
    } catch {
      toastError('Could not copy', data.publicUrl);
    }
  };
  const tile = 'h-12 justify-center';
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Share receivables" sub={when ? `What the client page shows: the version of ${when}` : undefined} size="md">
      {!data.latestVersion ? (
        <p className="text-[14px] text-ink-muted">Nothing is published yet. Click Update first, then share.</p>
      ) : (
        <div className="grid gap-3">
          {data.unpublishedChanges ? (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
              {data.unpublishedChanges} unpublished change{data.unpublishedChanges === 1 ? '' : 's'}. Shared links show the published version until you click Update.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Input readOnly value={data.publicUrl} className="font-mono text-[12px]" aria-label="Client page link" onFocus={(e) => e.target.select()} />
            <Button onClick={copy}>
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" className={tile} asChild>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            </Button>
            <Button
              variant="secondary"
              className={tile}
              onClick={() => {
                onClose();
                onEmail();
              }}
            >
              <Mail aria-hidden /> Email
            </Button>
            <Button variant="secondary" className={tile} asChild>
              <a href={printUrl} target="_blank" rel="noreferrer">
                <FileText aria-hidden /> PDF
              </a>
            </Button>
            <Button variant="secondary" className={tile} asChild>
              <a href={`/api/receivables/sheets/${data.sheet.id}/export`}>
                <Download aria-hidden /> Excel
              </a>
            </Button>
          </div>
          <p className="text-[12.5px] text-ink-muted">PDF opens the client page ready to print; choose “Save as PDF” in the print box.</p>
        </div>
      )}
    </Modal>
  );
}
