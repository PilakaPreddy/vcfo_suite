'use client';

import { useState } from 'react';
import { Link2, Users } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sumInr } from '@/lib/receivables/summary';
import type { Partner } from '@/lib/receivables/model';
import type { ManagerSheetDto, PartnerDto } from '@/lib/receivables/wire';
import type { useReceivablesActions } from '@/hooks/use-receivables';
import { inr } from '../format';
import { PartnerLoginCell } from './PartnerLogin';

/**
 * The Partners tab: the client partner page link and the client partners. Their email gets the
 * reminders. Since Phase 8 each partner signs in (the Login column, `PartnerLogin.tsx`): the
 * manager invites them, resends the invite, resets the password or disables the login, and turns
 * their publish alert emails on or off (the Alerts column). The page link carries no secret, so
 * there is no key to reset and no per-partner link. Phase 10: section cards, a table from
 * 1024px and one card per partner below that.
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
  const setActive = (p: PartnerDto, active: boolean) => actions.updatePartner.mutate({ id: p.id, active }, { onError: (e) => toastError('Not saved', errorText(e)) });
  const setAlerts = (p: PartnerDto, notifyOnPublish: boolean) =>
    actions.updatePartner.mutate(
      { id: p.id, notifyOnPublish },
      { onSuccess: () => toastSuccess(notifyOnPublish ? `${p.name} gets publish alerts` : `No publish alerts for ${p.name}`), onError: (e) => toastError('Not saved', errorText(e)) },
    );
  const facts = (p: PartnerDto) => {
    const mine = data.invoices.filter((i) => i.partnerId === p.id);
    return { clients: [...new Set(mine.map((i) => i.clientName))].join(', ') || '—', open: sumInr(mine.filter((i) => i.status === 'open')) };
  };

  return (
    <div className="grid gap-4">
      <DashSection title="Client partner page" headIcon={{ icon: Link2, tone: 'blue' }} meta="Each partner signs in and sees only their own published invoices">
        <div className="flex gap-2">
          <Input readOnly value={data.publicUrl} className="font-mono text-[12px]" aria-label="Client page link" onFocus={(e) => e.target.select()} />
          <Button onClick={() => copy(data.publicUrl, 'Client link')}>Copy</Button>
        </div>
      </DashSection>

      <DashSection
        title="Client partners"
        headIcon={{ icon: Users, tone: 'violet' }}
        meta={`${data.partners.length} · the reminder recipients`}
        right={
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            Add partner
          </Button>
        }
        flush
      >
        {data.partners.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No client partners yet. Add them, then pick a partner on each invoice."
              action={
                <Button size="sm" onClick={() => setEditing('new')}>
                  Add partner
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={TH}>Partner</th>
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
                  {data.partners.map((p) => {
                    const f = facts(p);
                    return (
                      <tr key={p.id} className={p.active ? '' : 'opacity-60'}>
                        <td className={TD}>
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-[11.5px] text-ink-muted">{p.email}</div>
                        </td>
                        <td className={`${TD} max-w-[220px]`}>{f.clients}</td>
                        <td className={`${TD} text-right tabular-nums`}>{inr(f.open)}</td>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-2">
                            <Switch checked={p.active} aria-label={`${p.name} active`} onCheckedChange={(v) => setActive(p, v)} />
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
                            onCheckedChange={(v) => setAlerts(p, v)}
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

            <ul className="lg:hidden">
              {data.partners.map((p) => {
                const f = facts(p);
                return (
                  <li key={p.id} className={`grid gap-2.5 border-t border-line-soft px-4 py-3.5 first:border-t-0 ${p.active ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[11.5px] text-ink-muted">{p.email}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate text-ink-muted">{f.clients}</span>
                      <span className="whitespace-nowrap tabular-nums">₹{inr(f.open)} open</span>
                    </div>
                    <PartnerLoginCell sheetId={data.sheet.id} partner={p} />
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                      <span className="inline-flex items-center gap-2">
                        <Switch id={`rcv-p-active-${p.id}`} checked={p.active} onCheckedChange={(v) => setActive(p, v)} />
                        <label htmlFor={`rcv-p-active-${p.id}`}>Active</label>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Switch id={`rcv-p-alerts-${p.id}`} checked={p.notifyOnPublish} onCheckedChange={(v) => setAlerts(p, v)} />
                        <label htmlFor={`rcv-p-alerts-${p.id}`}>Publish alerts</label>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DashSection>

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
    </div>
  );
}
