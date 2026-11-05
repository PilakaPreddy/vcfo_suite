'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { openRegistrationCertificate, useSetRegistrationDates, type RegistrationFacts } from '@/hooks/use-registration-facts';
import { renewalOf } from '@/lib/registrations/registration-facts';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { plainDate } from '@/lib/compliance/spectrum-status';

/**
 * Renewal and certificate parts for the Registrations list and record (G-05), shared by
 * the staff views and the client portal. The dates are the ones stored on the
 * registration's credentials row; "Due soon" starts 30 days before expiry and "Overdue"
 * the day after it.
 */

/** "Renew by" cell: the expiry date and, when it is close or past, the chip. */
export function RenewByCell({ facts, now }: { facts: RegistrationFacts | null | undefined; now: Date }) {
  const r = renewalOf(facts, now);
  if (!r) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={r.word === 'Overdue' ? 'font-medium text-danger' : r.word ? 'font-medium text-warning' : 'text-ink-2'}>{plainDate(r.renewBy, now)}</span>
      {r.word ? (
        <Chip fixed className="hidden xl:inline-flex">
          {r.word}
        </Chip>
      ) : null}
    </span>
  );
}

/** One line for the Renewal card: when it renews and by when. */
export function renewalLine(facts: RegistrationFacts | null | undefined, now: Date): string | null {
  if (!facts) return null;
  const r = renewalOf(facts, now);
  const every = facts.renewEveryMonths
    ? `Renews every ${facts.renewEveryMonths === 12 ? 'year' : `${facts.renewEveryMonths} months`}.`
    : null;
  if (!r) return every;
  const when =
    r.days < 0 ? `Expired on ${plainDate(r.renewBy, now)}, ${-r.days} day${r.days === -1 ? '' : 's'} ago.` : `Renew by ${plainDate(r.renewBy, now)}.`;
  return [when, every].filter(Boolean).join(' ');
}

/** The certificate button: opens the signed URL in a new tab. */
export function CertificateButton({
  facts,
  engagementId,
  size = 'sm',
  variant = 'secondary',
}: {
  facts: RegistrationFacts | null | undefined;
  /** Staff must name the engagement; a client leaves it out. */
  engagementId?: string | null;
  size?: 'sm' | 'default';
  variant?: 'secondary' | 'ghost' | 'link';
}) {
  const [busy, setBusy] = useState(false);
  if (!facts?.certificate?.downloadable) return null;
  return (
    <Button
      size={size}
      variant={variant}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await openRegistrationCertificate(facts.stepId, engagementId);
        } catch (e) {
          toastError('Could not open the certificate', errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      Certificate
    </Button>
  );
}

/** Staff dialog: issue date, expiry and renewal period of one registration. */
export function RegistrationDatesDialog({
  open,
  onOpenChange,
  engagementId,
  stepId,
  title,
  facts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  stepId: string;
  title: string;
  facts: RegistrationFacts | null | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open ? <DatesForm engagementId={engagementId} stepId={stepId} title={title} facts={facts} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DatesForm({
  engagementId,
  stepId,
  title,
  facts,
  onDone,
}: {
  engagementId: string;
  stepId: string;
  title: string;
  facts: RegistrationFacts | null | undefined;
  onDone: () => void;
}) {
  const save = useSetRegistrationDates();
  const [issuedOn, setIssuedOn] = useState(facts?.issuedOn ?? '');
  const [expiresOn, setExpiresOn] = useState(facts?.expiresOn ?? '');
  const [months, setMonths] = useState(facts?.renewEveryMonths ? String(facts.renewEveryMonths) : '');
  const monthsN = months.trim() ? Number.parseInt(months, 10) : null;
  const monthsBad = months.trim() !== '' && (!Number.isFinite(monthsN) || monthsN! < 1 || monthsN! > 240);
  const orderBad = Boolean(issuedOn && expiresOn && expiresOn <= issuedOn);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (monthsBad || orderBad) return;
        try {
          await save.mutateAsync({
            engagementId,
            stepId,
            issuedOn: issuedOn || null,
            expiresOn: expiresOn || null,
            renewEveryMonths: monthsN,
          });
          toastSuccess('Renewal dates saved');
          onDone();
        } catch (err) {
          toastError('Could not save the dates', errorMessage(err));
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Renewal dates</DialogTitle>
        <p className="text-[13.5px] text-ink-muted">{title}</p>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="reg-issued">Issued on</Label>
        <Input id="reg-issued" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reg-expires">Expires on</Label>
        <Input id="reg-expires" type="date" value={expiresOn} aria-invalid={orderBad} onChange={(e) => setExpiresOn(e.target.value)} />
        {orderBad ? <p className="text-[12.5px] text-danger">Expiry must be after the issue date.</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reg-months">Renews every (months)</Label>
        <Input id="reg-months" inputMode="numeric" value={months} aria-invalid={monthsBad} onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ''))} />
        {monthsBad ? <p className="text-[12.5px] text-danger">Enter 1 to 240 months.</p> : null}
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || monthsBad || orderBad}>
          {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
