'use client';

import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  CLIENT_SUBMITTED_EVENT,
  clientSubmittedCopy,
  type ClientSubmittedNoticeDetail,
} from '@/lib/client-portal/submitted-notice';

/**
 * The small "Details submitted" pop-up a client sees after a Submit. Mounted
 * once in the client portal shell so it stays up while the page moves on to the
 * next step (see `src/lib/client-portal/submitted-notice.ts`).
 */
export function ClientSubmittedNotice() {
  const [detail, setDetail] = useState<ClientSubmittedNoticeDetail | null>(null);

  useEffect(() => {
    const onSubmitted = (event: Event) => {
      const next = (event as CustomEvent<ClientSubmittedNoticeDetail>).detail;
      if (next) setDetail(next);
    };
    window.addEventListener(CLIENT_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(CLIENT_SUBMITTED_EVENT, onSubmitted);
  }, []);

  const copy = detail ? clientSubmittedCopy(detail) : null;
  return (
    <Modal
      open={Boolean(detail)}
      onOpenChange={(open) => {
        if (!open) setDetail(null);
      }}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <CircleCheck size={18} strokeWidth={1.8} className="text-positive" aria-hidden />
          {copy?.title ?? 'Details submitted'}
        </span>
      }
      description={copy?.body}
      footer={<Button onClick={() => setDetail(null)}>OK</Button>}
    >
      <p className="text-[14px] leading-relaxed text-ink-2">{copy?.body}</p>
    </Modal>
  );
}
