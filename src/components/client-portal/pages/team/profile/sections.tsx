'use client';

/**
 * The Profile form sections (prototype ProfileScreen `FormSection`): About you, Sign-in and
 * security, Notifications, Appearance and Company. Each is one section card of form rows,
 * label and hint on the left, the control on the right. Text fields save on blur and a green
 * "Saved" chip shows in the card head for 1.5 s. Everything reads and writes real data:
 * `/api/account/profile`, `/api/account/avatar`, `/api/client/account/password`,
 * `/api/account/two-step`, `/api/account/sessions` and `/api/client/notification-prefs`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { TwoStepRows } from '@/views/settings/account/TwoStepRows';
import { DevicesRows } from '@/views/settings/account/DevicesRows';
import { cn } from '@/lib/utils';
import { usePortal } from '../../../PortalProvider';
import { TextSizeSetting } from '../../../TextSizeSetting';
import { SCard } from '../../compliances/spectrum';
import { api } from '../common';
import { useClientTeam } from '../team-sections';
import { PasswordForm } from './password-form';
import { clock12, useProfileData, type Profile } from './use-profile';
import { WhatsAppDialog } from './whatsapp-dialog';

export type SecKey = 'about' | 'security' | 'notify' | 'look' | 'company' | 'team' | 'settings';

export const LABEL: Record<SecKey, string> = {
  about: 'About you',
  security: 'Sign-in and security',
  notify: 'Notifications',
  look: 'Appearance',
  company: 'Company',
  team: 'Team',
  // The overview of every setting on one page; "Settings" inside Settings read as a loop.
  settings: 'All settings',
};

/** One form row: label with a hint on the left, the control on the right (464 px column). */
function FormRow({ k, hint, children }: { k: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,464px)] sm:items-center md:px-5">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{k}</span>
        {hint ? <span className="block text-[12.5px] text-ink-muted">{hint}</span> : null}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[14px] text-ink">{children}</span>
    </div>
  );
}

/** The green "Saved" chip for 1.5 s after a change. */
function useSaved() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tick = () => {
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1500);
  };
  return { saved, tick };
}

function SectionShell({ sec, saved, children }: { sec: SecKey; saved?: boolean; children: ReactNode }) {
  return (
    <SCard
      title={LABEL[sec]}
      flush
      right={
        saved ? (
          <Chip fixed tone="ok">
            Saved
          </Chip>
        ) : undefined
      }
    >
      {children}
    </SCard>
  );
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace('Sept', 'Sep');
}

/** Upload or remove the profile photo (`/api/account/avatar`). */
export function usePhoto(setProfile: (x: Partial<Profile>) => void) {
  const { toast } = usePortal();
  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch('/api/account/avatar', { method: 'POST', body: fd });
      const d = (await r.json()) as { avatarUrl?: string | null; error?: string };
      if (!r.ok) throw new Error(d.error === 'file_too_large' ? 'That photo is too large' : d.error === 'unsupported_type' ? 'Use a JPG, PNG or WebP photo' : 'Upload failed');
      setProfile({ avatarUrl: d.avatarUrl ?? null });
      toast('Photo updated', { kind: 'saved' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    }
  };
  const remove = async () => {
    try {
      await api('/api/account/avatar', { method: 'DELETE' });
      setProfile({ avatarUrl: null });
      toast('Photo removed');
    } catch {
      toast('Could not remove the photo');
    }
  };
  return { upload, remove };
}

/** A hidden file input for the photo; `open()` shows the picker. */
export function PhotoInput({ inputRef, onPick }: { inputRef: React.RefObject<HTMLInputElement | null>; onPick: (f: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
      aria-label="Photo file"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) onPick(f);
      }}
    />
  );
}

/* ------------------------------------------------------------------ About you */

function AboutSection() {
  const { p, setProfile, patchProfile, refreshShell, account, saveAccount } = useProfileData();
  const { toast } = usePortal();
  const { saved, tick } = useSaved();
  const [designation, setDesignation] = useState('');
  useEffect(() => {
    if (account) setDesignation(account.designation ?? '');
  }, [account]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const photo = useRef<HTMLInputElement>(null);
  const { upload, remove } = usePhoto(setProfile);

  useEffect(() => {
    if (!p) return;
    setName(p.name);
    setPhone(p.phone ?? '');
  }, [p]);

  const saveField = async (patch: { name?: string; phone?: string | null }) => {
    const prev = p;
    if (!prev) return;
    setProfile(patch);
    try {
      await api('/api/account/profile', { method: 'PATCH', json: { name: patch.name ?? prev.name, phone: 'phone' in patch ? patch.phone : prev.phone } });
      tick();
      if (patch.name) refreshShell();
    } catch {
      setProfile({ name: prev.name, phone: prev.phone });
      toast('Could not save that change');
    }
  };

  const saveEmail = async () => {
    if (!p) return;
    const next = email.trim().toLowerCase();
    if (!next || next === p.email) return setEmailOpen(false);
    if (!pw) return setEmailErr('Enter your password to change your email');
    setEmailErr('');
    try {
      await patchProfile({ email: next, currentPassword: pw });
      setProfile({ email: next });
      setEmailOpen(false);
      tick();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setEmailErr(m === 'invalid_credentials' ? 'That password is not right' : m === 'email_already_registered' ? 'That email is already in use' : 'Could not change your email');
    }
  };

  return (
    <SectionShell sec="about" saved={saved}>
      <FormRow k="Name">
        <Input
          aria-label="Name"
          value={name}
          disabled={!p}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (!p) return;
            if (!v) return setName(p.name);
            if (v !== p.name) void saveField({ name: v });
          }}
          autoComplete="name"
        />
      </FormRow>
      <FormRow k="Designation" hint="Your role in the company">
        <Input
          aria-label="Designation"
          value={designation}
          disabled={!account}
          maxLength={80}
          onChange={(e) => setDesignation(e.target.value)}
          onBlur={() => {
            if (!account) return;
            const v = designation.trim() || null;
            if (v !== (account.designation ?? null)) void saveAccount({ designation: v }).then((ok) => ok && tick());
          }}
          autoComplete="organization-title"
        />
      </FormRow>
      <FormRow k="Mobile" hint="For sign-in codes and WhatsApp">
        <Input
          aria-label="Mobile"
          value={phone}
          disabled={!p}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => {
            if (!p) return;
            const v = phone.trim() || null;
            if (v !== (p.phone ?? null)) void saveField({ phone: v });
          }}
          autoComplete="tel"
        />
      </FormRow>
      <FormRow k="Email" hint="Your sign-in address">
        <span className="min-w-0 flex-1 break-all">{p?.email ?? ''}</span>
        {!emailOpen ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={!p}
            onClick={() => {
              setEmail(p?.email ?? '');
              setPw('');
              setEmailErr('');
              setEmailOpen(true);
            }}
          >
            Change
          </Button>
        ) : null}
      </FormRow>
      {emailOpen ? (
        <form
          className="grid gap-3 border-t border-line-soft px-4 py-3 md:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEmail();
          }}
        >
          <label htmlFor="pf-email" className="grid gap-1.5 text-[13px] font-medium text-ink-2">
            New email
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the field when the form opens */}
            <Input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>
          <label htmlFor="pf-email-pw" className="grid gap-1.5 text-[13px] font-medium text-ink-2">
            Current password
            <Input id="pf-email-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </label>
          {emailErr ? (
            <span role="alert" className="text-[13px] font-medium text-danger">
              {emailErr}
            </span>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save email
            </Button>
          </div>
        </form>
      ) : null}
      <FormRow k="Photo">
        <Button size="sm" variant="secondary" disabled={!p} onClick={() => photo.current?.click()}>
          Change photo
        </Button>
        {p?.avatarUrl ? (
          <Button size="sm" variant="ghost" onClick={() => void remove()}>
            Remove photo
          </Button>
        ) : null}
        <PhotoInput inputRef={photo} onPick={(f) => void upload(f)} />
      </FormRow>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ Sign-in and security */

function SecuritySection() {
  const { changedAt, setChangedAt } = useProfileData();
  const { toast } = usePortal();
  const [pw, setPw] = useState(false);
  return (
    <SectionShell sec="security">
      <FormRow k="Password" hint={changedAt ? `Last changed ${fullDate(changedAt)}` : undefined}>
        {!pw ? (
          <Button size="sm" variant="secondary" onClick={() => setPw(true)}>
            Change password
          </Button>
        ) : null}
      </FormRow>
      {pw ? (
        <div className="border-t border-line-soft px-4 py-3 md:px-5">
          <PasswordForm
            onCancel={() => setPw(false)}
            onSaved={(at) => {
              setChangedAt(at);
              setPw(false);
              toast('Password changed', { kind: 'saved' });
            }}
          />
        </div>
      ) : null}
      <div className="border-t border-line-soft">
        <TwoStepRows />
      </div>
      <div className="border-t border-line-soft">
        <DevicesRows onSignOutHere={() => void signOut({ callbackUrl: '/login' })} />
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ Notifications */

/** WhatsApp on and off, shared by the Notifications section and the Settings view. */
export function useWhatsApp() {
  const { toast, shell } = usePortal();
  const { p, setProfile, patchProfile } = useProfileData();
  const [dialog, setDialog] = useState(false);
  const off = async () => {
    setProfile({ whatsappOptIn: false });
    try {
      await patchProfile({ whatsappOptIn: false });
      toast('WhatsApp turned off', {
        undo: () => {
          setProfile({ whatsappOptIn: true });
          patchProfile({ whatsappOptIn: true }).catch(() => {
            setProfile({ whatsappOptIn: false });
            toast('Could not turn WhatsApp back on');
          });
        },
      });
    } catch {
      setProfile({ whatsappOptIn: true });
      toast('Could not turn WhatsApp off');
    }
  };
  const node =
    dialog && p ? (
      <WhatsAppDialog
        phoneE164={p.phoneE164}
        company={shell?.companyShort || 'your company'}
        patchProfile={patchProfile}
        onClose={() => setDialog(false)}
        onDone={(phoneE164) => {
          setProfile({ whatsappOptIn: true, phoneE164 });
          setDialog(false);
          toast('WhatsApp is on', {
            undo: () => {
              setProfile({ whatsappOptIn: false });
              patchProfile({ whatsappOptIn: false }).catch(() => toast('Could not turn WhatsApp off'));
            },
          });
        }}
      />
    ) : null;
  return { on: Boolean(p?.whatsappOptIn), ready: Boolean(p), open: () => setDialog(true), off, node };
}

function NotifySection() {
  const { prefs, savePref, account, saveAccount } = useProfileData();
  const wa = useWhatsApp();
  const { saved, tick } = useSaved();
  const [start, setStart] = useState('21:00');
  const [end, setEnd] = useState('08:00');
  useEffect(() => {
    if (!prefs) return;
    setStart(prefs.quietStart);
    setEnd(prefs.quietEnd);
  }, [prefs]);
  const chip = (label: string, checked: boolean, opts: { disabled?: boolean; tip?: string; onChange?: (v: boolean) => void }) => (
    <label
      key={label}
      title={opts.tip}
      className={cn('inline-flex h-[30px] items-center gap-2 rounded-md border-1.5 border-line-strong px-2.5 text-[13px] text-ink', opts.disabled ? 'cursor-default' : 'cursor-pointer')}
    >
      <Checkbox checked={checked} disabled={opts.disabled} aria-label={label} onCheckedChange={(v) => opts.onChange?.(v === true)} />
      {label}
    </label>
  );
  const quietOn = prefs?.quietHours ?? true;
  return (
    <SectionShell sec="notify" saved={saved}>
      <FormRow k="Channels" hint="Where VCFO reaches you">
        {chip('In-app', true, { disabled: true, tip: 'Always on' })}
        {chip('Email', true, { disabled: true, tip: 'Always on · email is the record' })}
        {chip('WhatsApp', wa.on, { disabled: !wa.ready, onChange: (v) => (v ? wa.open() : void wa.off()) })}
      </FormRow>
      <FormRow k="Quiet hours" hint={`No WhatsApp messages from ${clock12(start)} to ${clock12(end)}`}>
        <Switch
          checked={quietOn}
          disabled={!prefs}
          aria-label="Quiet hours"
          onCheckedChange={(v) => savePref({ quietHours: v }, { onSaved: tick })}
        />
        <Input
          type="time"
          aria-label="Quiet hours start"
          className="w-[120px]"
          value={start}
          disabled={!prefs || !quietOn}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => prefs && start && start !== prefs.quietStart && savePref({ quietStart: start }, { onSaved: tick })}
        />
        <span className="text-ink-muted">to</span>
        <Input
          type="time"
          aria-label="Quiet hours end"
          className="w-[120px]"
          value={end}
          disabled={!prefs || !quietOn}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => prefs && end && end !== prefs.quietEnd && savePref({ quietEnd: end }, { onSaved: tick })}
        />
      </FormRow>
      <FormRow k="Remind me before a due date">
        <SpectrumTabs
          label="Remind me before a due date"
          items={[
            { key: '7', label: '7 days' },
            { key: '3', label: '3 days' },
            { key: '1', label: '1 day' },
          ]}
          /* null means the firm default: no option is picked until the person chooses */
          value={account?.remindDays ? String(account.remindDays) : ''}
          onChange={(k) => {
            if (!account) return;
            void saveAccount({ remindDays: Number(k) as 7 | 3 | 1 }).then((ok) => ok && tick());
          }}
        />
      </FormRow>
      {wa.node}
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ Appearance */

const THEMES = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
] as const;
type ThemeKey = (typeof THEMES)[number]['key'];

/** Light, Dark or System, saved to the account and this browser; a toast with Undo. */
export function ThemePicker() {
  const { prefs, savePrefs, theme, toast } = usePortal();
  const mode: ThemeKey = prefs?.theme ?? theme;
  const set = (v: ThemeKey) => {
    try {
      localStorage.setItem('vcfo.theme', JSON.stringify(v));
    } catch {
      /* private mode */
    }
    savePrefs({ theme: v });
  };
  return (
    <SpectrumTabs
      label="Theme"
      items={THEMES.map((t) => ({ key: t.key, label: t.label }))}
      value={mode}
      onChange={(k) => {
        const was = mode;
        set(k as ThemeKey);
        toast(`Theme · ${THEMES.find((x) => x.key === k)?.label}`, { undo: () => set(was) });
      }}
    />
  );
}

/** Reduce motion: the app setting wins; off falls back to the OS setting. A toast with Undo. */
export function MotionSwitch() {
  const appearance = useShellAppearance();
  const { toast } = usePortal();
  const rm = appearance.prefs.reduceMotion;
  return (
    <Switch
      checked={rm}
      aria-label="Reduce motion"
      onCheckedChange={(v) => {
        appearance.update({ reduceMotion: v });
        toast(v ? 'Reduce motion on' : 'Reduce motion off', { undo: () => appearance.update({ reduceMotion: !v }) });
      }}
    />
  );
}

function LookSection() {
  return (
    <SectionShell sec="look">
      <FormRow k="Theme">
        <ThemePicker />
      </FormRow>
      <FormRow k="Text size">
        <TextSizeSetting />
      </FormRow>
      <FormRow k="Reduce motion">
        <MotionSwitch />
      </FormRow>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ Company */

function CompanySection({ onTeam }: { onTeam: () => void }) {
  const { shell } = usePortal();
  const team = useClientTeam();
  const people = team.data?.people ?? [];
  return (
    <SectionShell sec="company">
      <FormRow k="Company">
        <span className="font-medium">{shell?.companyName ?? ''}</span>
      </FormRow>
      <FormRow k="People who can sign in">
        {team.isLoading ? (
          <span className="block h-4 w-48 animate-pulse rounded-mark bg-surface-sunken" aria-hidden />
        ) : team.isError ? (
          <span className="text-ink-muted">Could not load</span>
        ) : (
          <span>{people.map((m) => `${m.name} (${m.role === 'primary' ? 'primary' : 'member'})`).join(' · ') || 'Only you'}</span>
        )}
      </FormRow>
      {team.data?.isPrimary ? (
        <FormRow k="Add a person" hint="They get an invite by email">
          <Button size="sm" variant="secondary" onClick={onTeam}>
            Invite
          </Button>
        </FormRow>
      ) : null}
      <FormRow k="Something changed?" hint="SBC updates your records and tells you what changes">
        <Button asChild size="sm" variant="secondary">
          <Link href="/app/client/messages">Ask for a change</Link>
        </Button>
      </FormRow>
    </SectionShell>
  );
}

export function FormSection({ sec, onTeam }: { sec: SecKey; onTeam: () => void }) {
  if (sec === 'about') return <AboutSection />;
  if (sec === 'security') return <SecuritySection />;
  if (sec === 'notify') return <NotifySection />;
  if (sec === 'look') return <LookSection />;
  if (sec === 'company') return <CompanySection onTeam={onTeam} />;
  return null;
}

