'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { useChangePassword, usePartnerHome, useSetNotifyOnPublish } from '@/hooks/use-receivables-partner';
import { PartnerHeader } from './PartnerHeader';

/**
 * The signed-in client partner's account page (/receivables/account, Phase 8 of
 * docs/specs/receivables/PLAN.md): their name and email, the "Email me when SBC publishes an
 * update" switch, change password and Log out. Name and email are managed by SBC.
 */

const MIN_PASSWORD = 8;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

/** A section card (the shared DashSection), so the account page matches the invoices page. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <DashSection title={title}>{children}</DashSection>;
}

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && next.length >= MIN_PASSWORD && confirm === next && !change.isPending;

  const submit = () => {
    if (!ready) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toastSuccess('Password changed', 'Use the new password next time you sign in.');
          setCurrent('');
          setNext('');
          setConfirm('');
        },
        onError: (e) => toastError('Password not changed', errorText(e)),
      },
    );
  };

  return (
    <Card title="Change password">
      <form
        className="grid max-w-md gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Current password" htmlFor="rcv-pw-current">
          <Input id="rcv-pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="rcv-pw-new" hint={`At least ${MIN_PASSWORD} characters.`} error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : undefined}>
          <Input id="rcv-pw-new" type="password" autoComplete="new-password" value={next} aria-invalid={tooShort} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="rcv-pw-confirm" error={mismatch ? 'The two passwords do not match.' : undefined}>
          <Input id="rcv-pw-confirm" type="password" autoComplete="new-password" value={confirm} aria-invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={!ready}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const home = usePartnerHome();
  const notify = useSetNotifyOnPublish();
  const data = home.data;

  const toggle = (on: boolean) =>
    notify.mutate(on, {
      onSuccess: () => toastSuccess(on ? 'Update emails on' : 'Update emails off', on ? 'We will email you when SBC publishes changes to your invoices.' : 'You will not get an email when SBC publishes.'),
      onError: (e) => toastError('Setting not saved', errorText(e)),
    });

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <PartnerHeader clientOrgName={data?.clientOrgName} partnerName={data?.partner.name} current="account" />
        <h1 className="mb-4 text-[22px] font-medium leading-7 tracking-[-0.01em]">My account</h1>

        {home.isPending ? (
          <SkeletonRows rows={3} />
        ) : home.isError || !data ? (
          <EmptyState
            title={
              <span role="alert" className="text-ink-2">
                {home.error instanceof Error ? home.error.message : 'Your account did not load.'}
              </span>
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void home.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className="grid max-w-[880px] gap-4">
            <Card title="Your details">
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[12px] text-ink-muted">Name</dt>
                  <dd className="font-medium">{data.partner.name}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-muted">Email</dt>
                  <dd className="break-all font-mono text-[12.5px]">{data.partner.email}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[12.5px] text-ink-muted">To change your name or email, ask SBC.</p>
            </Card>

            <Card title="Emails">
              <div className="flex items-start justify-between gap-4">
                <label htmlFor="rcv-notify" className="grid gap-0.5 text-[13px]">
                  <span className="font-medium">Email me when SBC publishes an update</span>
                  <span className="text-[12.5px] text-ink-muted">Only when the update changes one of your invoices.</span>
                </label>
                <Switch id="rcv-notify" checked={data.partner.notifyOnPublish} disabled={notify.isPending} onCheckedChange={toggle} />
              </div>
            </Card>

            <PasswordCard />

            <Card title="Sign out">
              <p className="mb-3 text-[13px] text-ink-2">Sign out of the receivables page on this device.</p>
              <Button size="sm" variant="secondary" onClick={() => void signOut({ callbackUrl: '/receivables/login' })}>
                Log out
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

