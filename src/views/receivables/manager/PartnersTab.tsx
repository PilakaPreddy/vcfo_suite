'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sumInr } from '@/lib/receivables/summary';
import type { Partner } from '@/lib/receivables/model';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import type { useReceivablesActions } from '@/hooks/use-receivables';
import { inr } from '../format';
import { PartnerLoginCell } from './PartnerLogin';

/**
 * The Partners tab: the client partner page link and the client partners. Their email gets the
 * reminders. Since Phase 8 each partner signs in (the Login column, `PartnerLogin.tsx`): the
 * manager invites them, resends the invite, resets the password or disables the login, and turns
 * their publish alert emails on or off (the Alerts column). The page link carries no secret, so
 * there is no key to reset and no per-partner link.
 */

type Actions = ReturnType<typeof useReceivablesActions>;
const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toastSuccess(`${what} copied`, text);
  } catch {
    toastError('Could not copy', text);
  }
}

function PartnerDialog({ partner, onClose, onSave, busy, error }: { partner: Partner | null; onClose: () => void; onSave: (v: { name: string; email: string }) => void; busy: boolean; error: string | null }) {
  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const ok = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={partner ? 'Edit client partner' : 'Add client partner'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok || busy} onClick={() => onSave({ name: name.trim(), email: email.trim() })}>
            {partner ? 'Save' : 'Add partner'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Name" htmlFor="rcv-p-name">
          <Input id="rcv-p-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="rcv-p-email" hint="Reminders for this partner's invoices go here.">
          <Input id="rcv-p-email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {partner && partner.name !== name.trim() ? <p className="text-[12.5px] text-ink-muted">The client page shows the new name after the next Update.</p> : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function PartnersTab({ data, actions }: { data: ManagerSheetDto; actions: Actions }) {
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setEditing(null);
    setError(null);
  };

  return (
    <>
      <section className="mb-4 rounded-md border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">Client partner page</h2>
            <p className="mt-1 text-[13px] text-ink-muted">Each client partner signs in here and sees only their own invoices of the published version.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input readOnly value={data.publicUrl} className="font-mono text-[12px]" aria-label="Client page link" onFocus={(e) => e.target.select()} />
          <Button onClick={() => copy(data.publicUrl, 'Client link')}>Copy</Button>
        </div>
      </section>

      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">
          <b className="font-semibold text-ink">Client partners</b> · the client page filter and the reminder recipients
        </p>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          Add partner
        </Button>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-line bg-surface-raised">
        <table className="w-full min-w-[1040px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Email</th>
              <th className={TH}>Clients</th>
              <th className={`${TH} text-right`}>Open INR</th>
              <th className={TH}>Active</th>
              <th className={TH}>Login</th>
              <th className={TH}>Alerts</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.partners.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${TD} text-ink-muted`}>
                  No client partners yet. Add them, then pick a partner on each invoice.
                </td>
              </tr>
            ) : null}
            {data.partners.map((p) => {
              const mine = data.invoices.filter((i) => i.partnerId === p.id);
              return (
                <tr key={p.id} className={p.active ? '' : 'opacity-60'}>
                  <td className={TD}>{p.name}</td>
                  <td className={`${TD} font-mono text-[12px]`}>{p.email}</td>
                  <td className={TD}>{[...new Set(mine.map((i) => i.clientName))].join(', ') || '—'}</td>
                  <td className={`${TD} text-right font-mono text-[12px]`}>{inr(sumInr(mine.filter((i) => i.status === 'open')))}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2">
                      <Switch
                        checked={p.active}
                        aria-label={`${p.name} active`}
                        onCheckedChange={(active) => actions.updatePartner.mutate({ id: p.id, active }, { onError: (e) => toastError('Not saved', errorText(e)) })}
                      />
                      {p.active ? null : <Chip raw tone="idle">Inactive</Chip>}
                    </span>
                  </td>
                  <td className={TD}>
                    <PartnerLoginCell sheetId={data.sheet.id} partner={p} />
                  </td>
                  <td className={TD}>
                    <Switch
                      checked={p.notifyOnPublish}
                      aria-label={`Email ${p.name} after each Update that changes their invoices`}
                      title="Email after each Update that changes their invoices"
                      onCheckedChange={(notifyOnPublish) =>
                        actions.updatePartner.mutate(
                          { id: p.id, notifyOnPublish },
                          { onSuccess: () => toastSuccess(notifyOnPublish ? `${p.name} gets publish alerts` : `No publish alerts for ${p.name}`), onError: (e) => toastError('Not saved', errorText(e)) },
                        )
                      }
                    />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <PartnerDialog
          partner={editing === 'new' ? null : editing}
          busy={actions.addPartner.isPending || actions.updatePartner.isPending}
          error={error}
          onClose={close}
          onSave={(v) =>
            editing === 'new'
              ? actions.addPartner.mutate(v, { onSuccess: () => (close(), toastSuccess(`${v.name} added`)), onError: (e) => setError(errorText(e)) })
              : actions.updatePartner.mutate({ id: editing.id, ...v }, { onSuccess: () => (close(), toastSuccess('Saved')), onError: (e) => setError(errorText(e)) })
          }
        />
      ) : null}
    </>
  );
}
