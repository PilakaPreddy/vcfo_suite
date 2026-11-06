'use client';

import { useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRaiseEscalation } from './use-escalations';

const SUPER = '__super';

/**
 * "Escalate" (G-20): a self-contained button and dialog that raises an escalation on one
 * engagement. Any staff role may use it on a client they can reach; the route checks that.
 * Pass `admins` (firm admins and the super admin) to let the caller pick who it goes to;
 * without it the escalation goes to the super admin.
 */
export function RaiseEscalationButton({
  engagementId,
  companyName,
  admins,
  size = 'default',
  open: openProp,
  onOpenChange,
}: {
  engagementId: string;
  companyName?: string;
  admins?: Array<{ id: string; name: string; role: string }>;
  size?: 'default' | 'sm';
  /** Controlled from a menu: the dialog opens on this and the button is not drawn. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const raise = useRaiseEscalation();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : ownOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setOwnOpen(next);
  };
  const [reason, setReason] = useState('');
  const [to, setTo] = useState(SUPER);

  const submit = () => {
    if (!reason.trim()) return;
    raise.mutate(
      { engagementId, reason: reason.trim(), assignedTo: to === SUPER ? null : to },
      {
        onSuccess: () => {
          setOpen(false);
          setReason('');
          setTo(SUPER);
        },
      },
    );
  };

  const choices = (admins ?? []).filter((a) => a.role === 'admin');

  return (
    <>
      {controlled ? null : (
        <Button variant="outline" size={size} onClick={() => setOpen(true)}>
          <TriangleAlert aria-hidden />
          Escalate
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{companyName ? `Escalate ${companyName}` : 'Escalate'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {choices.length > 0 ? (
              <div>
                <Label className="text-[12.5px] text-ink-muted">To</Label>
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger className="mt-1" aria-label="Escalate to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUPER}>Super admin</SelectItem>
                    {choices.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label htmlFor={`escalate-${engagementId}`} className="text-[12.5px] text-ink-muted">Why</Label>
              <Textarea
                id={`escalate-${engagementId}`}
                rows={4}
                className="mt-1"
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-2 gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={raise.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!reason.trim() || raise.isPending}>
              {raise.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
