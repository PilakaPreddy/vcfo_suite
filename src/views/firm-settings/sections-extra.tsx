'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Loader2, Minus, Plug, Target, UserPlus } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PersonAvatar } from '@/components/super/parts/super-parts';
import { useSuperStaff, type SuperStaffRow } from '@/components/super/assign/use-super-staff';
import { TEMP_PASSWORD } from '@/views/admin/firm-people/types';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import {
  PERMISSION_ROLE_LABEL,
  PERMISSION_ROLES,
  PERMISSIONS,
  SERVICE_TARGET_KEYS,
  SERVICE_TARGET_LABEL,
  SERVICE_TARGET_UNIT,
  serviceTargetText,
  type FirmSettings,
  type FirmSettingsPatch,
  type Permission,
  type PermissionRole,
  type ServiceTargets,
} from '@/lib/firm-settings/firm-settings';
import type { FirmIntegration } from '@/lib/firm-settings/integrations';

/**
 * The Firm settings cards the prototype has beyond the first build (P-231 to P-241):
 * People and roles with Add person, Roles and permissions, Service targets and Integrations,
 * and the inline confirm a risky change asks first (R-40).
 *
 * People come from the People roster (`/api/admin/people`, firm-wide admins) and Add person
 * creates the account through the same route as the People page. Targets and permissions are
 * stored in `firm_settings` through `/api/firm-settings`, which audits each change, so they show
 * in Settings history. Integrations read `/api/firm-settings/integrations` (env presence, words
 * only) and the person's own Outlook link (`/api/outlook`).
 */

type Save = (patch: FirmSettingsPatch) => void;

/** R-40: a risky change asks first, in place, with Cancel and the action. */
function ConfirmRow({
  text,
  label,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  label: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alert"
      className="m-3 flex flex-wrap items-center gap-2 rounded-md border-1.5 border-caution-line bg-caution-soft px-3.5 py-2.5 text-[13.5px]"
    >
      <span className="min-w-0 flex-1 font-medium text-caution">{text}</span>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" onClick={onConfirm} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {label}
      </Button>
    </div>
  );
}

/* ---------- People and roles (P-231, P-232) ---------- */

const ROLE_WORD: Record<SuperStaffRow['role'], string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  manager: 'Manager',
  intern: 'Project lead',
  client: 'Client',
  developer: 'Developer',
};

const ROLE_TONE: Record<SuperStaffRow['role'], ChipTone> = {
  super_admin: 'violet',
  admin: 'prog',
  manager: 'teal',
  intern: 'idle',
  client: 'idle',
  developer: 'idle',
};

const ROLE_ORDER: SuperStaffRow['role'][] = ['super_admin', 'admin', 'manager', 'intern', 'developer'];

type PersonRow = SuperStaffRow & { reportsTo: string | null };

export function PeopleRolesSection() {
  const staff = useSuperStaff();
  const people = useQuery({
    queryKey: ['admin-people'],
    queryFn: async () => {
      const res = await fetch('/api/admin/people');
      const body = (await res.json().catch(() => ({}))) as { people?: SuperStaffRow[]; error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not load people');
      return body.people ?? [];
    },
    staleTime: 60_000,
  });
  const [adding, setAdding] = useState(false);

  const rows = useMemo<PersonRow[]>(() => {
    const all = (people.data ?? []).filter((p) => p.role !== 'client' && p.status !== 'removed');
    const byId = new Map(all.map((p) => [p.id, p]));
    return all
      .map((p) => ({
        ...p,
        reportsTo:
          p.role === 'intern'
            ? (p.reportsToManagerId ? byId.get(p.reportsToManagerId)?.name ?? null : null)
            : p.role === 'manager'
              ? staff.adminNameOf(p.id)
              : null,
      }))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  }, [people.data, staff]);

  const columns: EFilingColumn<PersonRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={p.name || p.email} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{p.name || p.email}</span>
            <span className="block truncate text-[12.5px] text-ink-muted">{p.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '132px',
      render: (p) => (
        <Chip raw fixed tone={ROLE_TONE[p.role]}>
          {ROLE_WORD[p.role]}
        </Chip>
      ),
    },
    {
      key: 'reportsTo',
      header: 'Reports to',
      render: (p) => (p.reportsTo ? <span className="whitespace-nowrap">{p.reportsTo}</span> : <span className="text-ink-faint">–</span>),
    },
  ];

  return (
    <DashSection
      title="People and roles"
      meta={people.data ? String(rows.length) : undefined}
      right={
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
          Add person
        </Button>
      }
      flush
    >
      {people.isPending ? (
        <SkeletonRows rows={4} className="p-2" />
      ) : people.isError ? (
        <div className="p-2">
          <EmptyState title="People could not load" action={<Button size="sm" variant="outline" onClick={() => void people.refetch()}>Try again</Button>} />
        </div>
      ) : (
        <EFilingGrid caption="People and roles" columns={columns} rows={rows} rowKey={(p) => p.id} pageSize={20} minWidth={520} empty="Nobody yet" />
      )}
      <AddPersonDialog open={adding} onOpenChange={setAdding} staff={staff} />
    </DashSection>
  );
}

type NewRole = 'admin' | 'manager' | 'intern';
const NEW_ROLES: NewRole[] = ['admin', 'manager', 'intern'];
const SELECT =
  'h-control-md w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';

/** "Add person": name, work email, role and who they report to. Same create route as People. */
function AddPersonDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: ReturnType<typeof useSuperStaff>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NewRole>('intern');
  const [reportsTo, setReportsTo] = useState('');
  const [saving, setSaving] = useState(false);

  const bosses = role === 'intern' ? staff.managers : role === 'manager' ? staff.firmAdmins.filter((a) => a.role === 'admin') : [];
  const needsBoss = role === 'intern';
  const ready = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (!needsBoss || reportsTo);

  const reset = () => {
    setName('');
    setEmail('');
    setRole('intern');
    setReportsTo('');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: TEMP_PASSWORD,
          role,
          reportsToManagerId: role === 'intern' ? reportsTo : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { userId?: string; error?: string };
      if (!res.ok) throw new Error(body.error === 'email_already_registered' ? 'That email already has an account' : body.error || 'Could not add the person');
      // A new manager's admin goes through the reporting route, as on the People page.
      if (role === 'manager' && reportsTo && body.userId) {
        const line = await fetch('/api/admin/people/reporting', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ managerId: body.userId, adminId: reportsTo }),
        });
        if (!line.ok) toastError('Person added, but the admin was not set');
      }
      toastSuccess(`${name.trim()} added as ${ROLE_WORD[role].toLowerCase()}`, `Temporary password ${TEMP_PASSWORD}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-people'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-reporting-lines'] }),
        queryClient.invalidateQueries({ queryKey: ['firm-settings'] }),
      ]);
      reset();
      onOpenChange(false);
    } catch (err) {
      toastError('Could not add the person', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-medium">Add person</DialogTitle>
        </DialogHeader>
        <form id="add-person-form" onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="ap-name" className="text-[12.5px] text-ink-muted">Name</Label>
            <Input id="ap-name" className="mt-1" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ap-email" className="text-[12.5px] text-ink-muted">Work email</Label>
            <Input id="ap-email" type="email" className="mt-1" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ap-role" className="text-[12.5px] text-ink-muted">Role</Label>
              <select
                id="ap-role"
                className={cn(SELECT, 'mt-1')}
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as NewRole);
                  setReportsTo('');
                }}
              >
                {NEW_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_WORD[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ap-boss" className="text-[12.5px] text-ink-muted">Reports to</Label>
              <select
                id="ap-boss"
                className={cn(SELECT, 'mt-1')}
                value={reportsTo}
                disabled={role === 'admin'}
                required={needsBoss}
                onChange={(e) => setReportsTo(e.target.value)}
              >
                <option value="">{role === 'admin' ? 'Super admin' : needsBoss ? 'Pick a manager' : 'No admin yet'}</option>
                {bosses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-person-form" disabled={saving || !ready}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Add person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Roles and permissions (P-236, P-237) ---------- */

type PermRow = { role: PermissionRole | 'super_admin' };

export function RolePermissionsSection({ settings, canChange, save }: { settings: FirmSettings; canChange: boolean; save: Save }) {
  const [ask, setAsk] = useState<{ role: PermissionRole; perm: Permission } | null>(null);
  const perms = settings.rolePermissions;
  const rows: PermRow[] = [{ role: 'super_admin' }, ...PERMISSION_ROLES.map((role) => ({ role }))];

  const cell = (r: PermRow, perm: Permission) => {
    const locked = r.role === 'super_admin' || !canChange;
    const on = r.role === 'super_admin' ? true : perms[r.role][perm];
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => r.role !== 'super_admin' && setAsk({ role: r.role, perm })}
        aria-label={`${PERMISSION_ROLE_LABEL[r.role]} can ${perm}: ${on ? 'yes' : 'no'}`}
        className={cn(
          'mx-auto grid h-7 w-7 place-items-center rounded-sm disabled:cursor-default',
          !locked && 'hover:bg-surface-sunken',
          on ? 'text-positive' : 'text-ink-faint',
        )}
      >
        {on ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Minus className="h-4 w-4" strokeWidth={1.6} aria-hidden />}
      </button>
    );
  };

  const columns: EFilingColumn<PermRow>[] = [
    { key: 'role', header: 'Role', render: (r) => <span className="font-medium text-ink">{PERMISSION_ROLE_LABEL[r.role]}</span> },
    ...PERMISSIONS.map((perm) => ({
      key: perm,
      header: `Can ${perm}`,
      width: perm === 'approve' ? '110px' : '96px',
      align: 'center' as const,
      render: (r: PermRow) => cell(r, perm),
    })),
  ];

  const pending = ask ? perms[ask.role][ask.perm] : false;

  return (
    <DashSection title="Roles and permissions" headIcon={{ icon: KeyRound, tone: 'violet' }} flush>
      {ask ? (
        <ConfirmRow
          text={`${pending ? 'Remove' : 'Give'} "can ${ask.perm}" ${pending ? 'from' : 'to'} ${PERMISSION_ROLE_LABEL[ask.role]}?`}
          label={pending ? 'Remove' : 'Give'}
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            const next = JSON.parse(JSON.stringify(perms)) as typeof perms;
            next[ask.role][ask.perm] = !pending;
            save({ rolePermissions: next });
            setAsk(null);
          }}
        />
      ) : null}
      <EFilingGrid caption="Roles and permissions" columns={columns} rows={rows} rowKey={(r) => r.role} minWidth={420} />
    </DashSection>
  );
}

/* ---------- Service targets (P-238) ---------- */

export function ServiceTargetsSection({ settings, canEdit, save }: { settings: FirmSettings; canEdit: boolean; save: Save }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const targets = settings.serviceTargets;

  const start = () => {
    setDraft(Object.fromEntries(SERVICE_TARGET_KEYS.map((k) => [k, targets[k] === null ? '' : String(targets[k])])));
    setEditing(true);
  };
  const parsed = Object.fromEntries(
    SERVICE_TARGET_KEYS.map((k) => {
      const raw = (draft[k] ?? '').trim();
      return [k, raw === '' ? null : Number(raw)];
    }),
  ) as unknown as ServiceTargets;
  const valid = SERVICE_TARGET_KEYS.every((k) => {
    const v = parsed[k];
    return v === null || (Number.isInteger(v) && v >= (k === 'partnerReportDay' ? 1 : 0) && (k !== 'partnerReportDay' || v <= 28));
  });
  const done = (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    save({ serviceTargets: parsed });
    setEditing(false);
  };

  return (
    <DashSection
      title="Service targets"
      headIcon={{ icon: Target, tone: 'teal' }}
      right={
        canEdit ? (
          editing ? (
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => done()} disabled={!valid}>
                Done
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={start}>
              Edit
            </Button>
          )
        ) : undefined
      }
    >
      {editing ? (
        <form className="grid gap-3" onSubmit={done}>
          {SERVICE_TARGET_KEYS.map((k) => (
            <div key={k}>
              <Label htmlFor={`st-${k}`} className="text-[12.5px] text-ink-muted">
                {SERVICE_TARGET_LABEL[k]}
              </Label>
              <span className="mt-1 flex items-center gap-2">
                <Input
                  id={`st-${k}`}
                  type="number"
                  inputMode="numeric"
                  min={k === 'partnerReportDay' ? 1 : 0}
                  max={k === 'partnerReportDay' ? 28 : undefined}
                  className="w-28"
                  value={draft[k] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
                <span className="text-[13px] text-ink-muted">{SERVICE_TARGET_UNIT[k]}</span>
              </span>
            </div>
          ))}
          <button type="submit" className="sr-only">
            Save
          </button>
        </form>
      ) : (
        <dl className="grid gap-3">
          {SERVICE_TARGET_KEYS.map((k) => {
            const text = serviceTargetText(k, targets[k]);
            return (
              <div key={k} className="min-w-0">
                <dt className="text-[12.5px] text-ink-muted">{SERVICE_TARGET_LABEL[k]}</dt>
                <dd className="mt-0.5 text-[14px] text-ink">{text ?? <span className="text-ink-faint">Not set</span>}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </DashSection>
  );
}

/* ---------- Integrations (P-241) ---------- */

type OutlookStatus = { configured: boolean; connected: boolean; msEmail?: string };

const STATUS_TONE: Record<string, ChipTone> = {
  Connected: 'ok',
  'Needs sign-in': 'warn',
  'Needs set-up': 'warn',
  'Not set up': 'idle',
};

export function IntegrationsSection({ isSuper }: { isSuper: boolean }) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['firm-integrations'],
    queryFn: async () => {
      const res = await fetch('/api/firm-settings/integrations');
      const body = (await res.json().catch(() => ({}))) as { integrations?: FirmIntegration[]; error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not load integrations');
      return body.integrations ?? [];
    },
    staleTime: 60_000,
  });
  const outlook = useQuery({
    queryKey: ['outlook-status'],
    queryFn: async () => {
      const res = await fetch('/api/outlook');
      if (!res.ok) return null;
      return (await res.json()) as OutlookStatus;
    },
    staleTime: 60_000,
  });
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch('/api/outlook/disconnect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not disconnect');
      toastSuccess('Outlook mail disconnected');
      await queryClient.invalidateQueries({ queryKey: ['outlook-status'] });
      setAsk(false);
    } catch (err) {
      toastError('Could not disconnect', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashSection title="Integrations" headIcon={{ icon: Plug, tone: 'blue' }} flush>
      {ask ? (
        <ConfirmRow
          text={`Disconnect Outlook mail${outlook.data?.msEmail ? ` (${outlook.data.msEmail})` : ''}? Mail you send from VCFO stops using your mailbox.`}
          label="Disconnect"
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={() => void disconnect()}
        />
      ) : null}
      {list.isPending ? (
        <SkeletonRows rows={4} className="p-4" />
      ) : list.isError ? (
        <div className="p-4">
          <EmptyState title="Integrations could not load" action={<Button size="sm" variant="outline" onClick={() => void list.refetch()}>Try again</Button>} />
        </div>
      ) : (
        <ul>
          {(list.data ?? []).map((i) => {
            const mine = i.id === 'outlook' && i.status === 'Connected' && outlook.data;
            const status = mine ? (outlook.data!.connected ? 'Connected' : 'Needs sign-in') : i.status;
            const sub = mine && outlook.data!.connected && outlook.data!.msEmail ? `${i.provider} · ${outlook.data!.msEmail}` : `${i.provider} · ${i.what}`;
            return (
              <li key={i.id} className="flex min-h-[56px] items-center gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{i.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">{sub}</span>
                </span>
                <Chip raw fixed tone={STATUS_TONE[status] ?? 'idle'} className="hidden sm:inline-flex">
                  {status}
                </Chip>
                {mine && outlook.data!.connected ? (
                  <Button size="sm" variant="ghost" onClick={() => setAsk(true)}>
                    Disconnect
                  </Button>
                ) : mine ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href="/api/outlook/connect">Sign in</a>
                  </Button>
                ) : i.status !== 'Connected' && isSuper ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/app/dev/connections">Set up</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}
