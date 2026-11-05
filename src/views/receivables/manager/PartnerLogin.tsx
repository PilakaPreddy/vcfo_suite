'use client';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import type { PartnerDto } from '@/lib/receivables/wire';
import { usePartnerLogin, type PartnerLoginActionName } from '@/hooks/use-receivables';

/**
 * Phase 8: the Login cell of a client partner on the Partners tab. It shows the login state
 * (none, invited, active, disabled) and the next actions: Invite, Resend invite, Reset password,
 * Disable and Enable. Invite, resend and reset email a set-password link to the partner.
 */

const CHIP: Record<PartnerDto['loginState'], { text: string; tone: 'ok' | 'warn' | 'idle' | 'bad' }> = {
  none: { text: 'No login', tone: 'idle' },
  invited: { text: 'Invited', tone: 'warn' },
  active: { text: 'Login active', tone: 'ok' },
  disabled: { text: 'Login disabled', tone: 'bad' },
};

const DONE: Record<PartnerLoginActionName, string> = {
  invite: 'Invite sent',
  resend: 'Invite sent again',
  reset: 'Password reset link sent',
  disable: 'Login disabled',
  enable: 'Login enabled',
};

export function PartnerLoginCell({ sheetId, partner }: { sheetId: string; partner: PartnerDto }) {
  const login = usePartnerLogin(sheetId);
  const first = partner.name.split(' ')[0] || partner.name;
  const run = (action: PartnerLoginActionName) => {
    if (action === 'disable' && !window.confirm(`Turn off ${first}'s login? They cannot sign in until you enable it again. A partner on several sheets loses all of them.`)) return;
    login.mutate(
      { id: partner.id, action },
      {
        onSuccess: (r) =>
          r.emailed === false
            ? toastError(`${DONE[action]}, but the email did not go out`, 'Try again in a minute.')
            : toastSuccess(DONE[action], r.emailed ? `Emailed to ${partner.email}` : undefined),
        onError: (e) => toastError('Not done', e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };
  const chip = CHIP[partner.loginState];
  const since =
    partner.loginState === 'invited' && partner.invitedAt
      ? `since ${sheetDate(partner.invitedAt.slice(0, 10))}`
      : partner.loginState === 'active' && partner.acceptedAt
        ? `since ${sheetDate(partner.acceptedAt.slice(0, 10))}`
        : null;
  const busy = login.isPending;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip raw tone={chip.tone}>
        {chip.text}
      </Chip>
      {since ? <span className="text-[11.5px] text-ink-faint">{since}</span> : null}
      {partner.loginState === 'none' ? (
        <Button size="sm" variant="secondary" disabled={busy || !partner.active} onClick={() => run('invite')} title={partner.active ? undefined : 'Turn the partner on first'}>
          Invite
        </Button>
      ) : null}
      {partner.loginState === 'invited' ? (
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run('resend')}>
          Resend invite
        </Button>
      ) : null}
      {partner.loginState === 'active' ? (
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run('reset')}>
          Reset password
        </Button>
      ) : null}
      {partner.loginState === 'invited' || partner.loginState === 'active' ? (
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run('disable')}>
          Disable
        </Button>
      ) : null}
      {partner.loginState === 'disabled' ? (
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run('enable')}>
          Enable
        </Button>
      ) : null}
    </span>
  );
}
