'use client';

import { getSession } from 'next-auth/react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { UserFace } from '@/components/common/UserFace';
import { initialsOf } from '@/components/ui/avatar-stack';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizeToE164 } from '@/lib/notify/phone';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastError } from '@/lib/toast-errors';
import { AppearanceSettings } from '@/views/settings/AppearanceSettings';
import { ProfileCard, SettingsRow } from './account/settings-layout';
import { IdentityCard } from './account/IdentityCard';
import { OutlookMailboxCard } from './account/OutlookMailboxCard';
import { TwoStepRows } from './account/TwoStepRows';
import { MicrosoftSignInRow } from './account/MicrosoftSignInRow';
import { DevicesRows } from './account/DevicesRows';
import { NotificationsCard } from './account/NotificationsCard';
import { PasswordStrength } from './account/PasswordStrength';
import { useAccountSettings } from './account/use-account-settings';
import { sectionFromLocation } from './account/sections';
import { cn } from '@/lib/utils';

type Props = {
  path: string;
};

/*
 * Profile (VCFO Spectrum, prototype ProfileScreen; K-16: Settings sits under Profile). A section
 * menu on the left and one section at a time on the right (P-612). `?tab=` names the section, as
 * in the prototype; the older `#appearance` link from the greeting card and the Outlook connect
 * return (`?outlook=`) still open the right section. G-25 adds two-step sign-in, the devices
 * list and Notifications. Project leads, managers and admins also get Settings: the old staff
 * Settings page (profile form, password, Outlook) in two columns (StaffSettingsSection).
 */
type SectionKey = 'profile' | 'security' | 'notify' | 'email' | 'appearance' | 'settings';

const SECTION_LABEL: Record<SectionKey, string> = {
  profile: 'About you',
  security: 'Sign-in and security',
  notify: 'Notifications',
  email: 'Email',
  appearance: 'Appearance',
  settings: 'Settings',
};

const STAFF_SETTINGS_ROLES = new Set(['admin', 'manager', 'intern']);

export default function AccountSettings({ path }: Props) {
  const {
    refreshAuth,
    signOut,
    updateSession,
    router,
    profile,
    setProfile,
    loading,
    editingProfile,
    savingProfile,
    draftName,
    setDraftName,
    draftEmail,
    setDraftEmail,
    draftPhone,
    setDraftPhone,
    draftWhatsapp,
    setDraftWhatsapp,
    draftWhatsappOptIn,
    setDraftWhatsappOptIn,
    draftDesignation,
    setDraftDesignation,
    draftMembershipNo,
    setDraftMembershipNo,
    emailPassword,
    setEmailPassword,
    outlookConnected,
    setOutlookConnected,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    submittingPassword,
    editingSecurity,
    setEditingSecurity,
    cancelEditProfile,
    saveProfile,
    onPasswordSubmit,
    display,
    roleLabel,
    isStaff,
    isDeveloper,
  } = useAccountSettings();
  // Two letters on every screen ("BH"), the same as the sidebar's face.
  const initials = display.name ? initialsOf(display.name) : '?';
  // Designation and membership number (P-617): staff and the developer; a client has neither.
  const hasTitle = isStaff || isDeveloper;

  const sections: SectionKey[] = isStaff
    ? [
        'profile',
        'security',
        'notify',
        'email',
        'appearance',
        ...(STAFF_SETTINGS_ROLES.has(display.role) ? (['settings'] as const) : []),
      ]
    : ['profile', 'security', 'notify', 'appearance'];
  // Super admin opens this view inside its own Settings tabs, which already use `?tab=`.
  const param = path.startsWith('/app/super/settings') ? 'section' : 'tab';
  const [active, setActive] = useState<SectionKey>('profile');
  const joined = sections.join(',');
  useEffect(() => {
    const k = sectionFromLocation(window.location.search, window.location.hash, param, joined.split(','));
    if (k) setActive(k as SectionKey);
  }, [joined, param]);

  const menuRef = useRef<HTMLDivElement>(null);
  // On a phone the menu scrolls sideways: keep the picked section in view.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-current]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const pick = (k: SectionKey) => {
    if (editingProfile && k !== 'profile' && k !== 'settings') cancelEditProfile();
    setActive(k);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set(param, k);
      u.hash = '';
      window.history.replaceState(null, '', u.toString());
    } catch {
      /* The address is a convenience; the section already shows. */
    }
  };

  // The "Saved" chip after the profile form saves (prototype StaffSettingsSection).
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    if (!profileSaved) return;
    const t = window.setTimeout(() => setProfileSaved(false), 1500);
    return () => window.clearTimeout(t);
  }, [profileSaved]);
  const savedProfileRef = useRef(profile);
  useEffect(() => {
    if (savedProfileRef.current && profile && savedProfileRef.current !== profile && !savingProfile) {
      setProfileSaved(true);
    }
    savedProfileRef.current = profile;
  }, [profile, savingProfile]);

  // Email changes need the current password, in the About you form and in Settings alike.
  const emailDiffers =
    !!profile && draftEmail.trim().toLowerCase() !== profile.email.toLowerCase();
  const passwordsDiffer = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const signOutHere = () => {
    void signOut()
      .then(() => router.push('/login'))
      .catch(() => {
        toastError('Sign out failed. Try again.');
      });
  };

  const savingLabel = (
    <>
      <Loader2 className="animate-spin" aria-hidden />
      Saving…
    </>
  );

  const photoRow = (
    <SettingsRow label="Photo">
      <IdentityCard
        name={display.name}
        email={display.email || '—'}
        roleLabel={roleLabel}
        initials={initials}
        avatarUrl={display.avatarUrl}
        loading={loading}
        isStaff={isStaff}
        outlookConnected={outlookConnected}
        onAvatarUrl={(avatarUrl) => {
          setProfile((prev) => (prev ? { ...prev, avatarUrl } : prev));
        }}
        onAvatarSaved={async () => {
          await updateSession();
          await getSession();
          await refreshAuth();
        }}
      />
    </SettingsRow>
  );

  const loadingRows = (
    <div aria-hidden>
      {['Full name', 'Email', 'Phone', 'Role'].map((label) => (
        <SettingsRow key={label} label={label}>
          <span className="block h-4 w-40 animate-pulse rounded-mark bg-surface-sunken" />
        </SettingsRow>
      ))}
    </div>
  );

  /** The profile form. `inline` (Settings) keeps it open and shows no Cancel unless something changed. */
  const profileForm = (inline: boolean, photo?: ReactNode) => {
    const dirty =
      !!profile &&
      (draftName !== profile.name ||
        emailDiffers ||
        draftPhone !== profile.phone ||
        draftWhatsapp !== profile.phoneE164 ||
        draftWhatsappOptIn !== profile.whatsappOptIn ||
        draftDesignation !== profile.designation ||
        draftMembershipNo !== profile.membershipNo);
    return (
      <form onSubmit={(e: FormEvent) => void saveProfile(e)}>
        <SettingsRow label="Name">
          <Label htmlFor="profile-name" className="sr-only">
            Full name
          </Label>
          <Input
            id="profile-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={120}
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the first field when the Edit form opens
            autoFocus={!inline}
          />
        </SettingsRow>
        {hasTitle ? (
          <>
            <SettingsRow label="Designation" hint="Shown on your emails and in the client portal">
              <Label htmlFor="profile-designation" className="sr-only">
                Designation
              </Label>
              <Input
                id="profile-designation"
                value={draftDesignation}
                onChange={(e) => setDraftDesignation(e.target.value)}
                maxLength={80}
                placeholder="Senior manager"
              />
            </SettingsRow>
            <SettingsRow label="Membership number" hint="ICAI or ICSI">
              <Label htmlFor="profile-membership" className="sr-only">
                Membership number
              </Label>
              <Input
                id="profile-membership"
                value={draftMembershipNo}
                onChange={(e) => setDraftMembershipNo(e.target.value.toUpperCase())}
                maxLength={24}
                pattern="[A-Za-z0-9/\-]*"
                className="font-mono"
                placeholder="A123456"
              />
            </SettingsRow>
          </>
        ) : null}
        <SettingsRow label="Email" hint="Your sign-in address">
          <Label htmlFor="profile-email" className="sr-only">
            Email
          </Label>
          <Input
            id="profile-email"
            type="email"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            maxLength={160}
            required
          />
        </SettingsRow>
        <SettingsRow label="Mobile" hint="For sign-in codes and WhatsApp">
          <Label htmlFor="profile-phone" className="sr-only">
            Phone
          </Label>
          <Input
            id="profile-phone"
            type="tel"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            maxLength={32}
            placeholder="+91 …"
          />
        </SettingsRow>
        <SettingsRow label="WhatsApp" hint="Optional, with the country code">
          <Label htmlFor="profile-whatsapp" className="sr-only">
            WhatsApp number
          </Label>
          <Input
            id="profile-whatsapp"
            type="tel"
            inputMode="tel"
            value={draftWhatsapp}
            onChange={(e) => setDraftWhatsapp(e.target.value)}
            maxLength={24}
            placeholder="+91 98765 43210"
          />
          {draftWhatsapp.trim() && !normalizeToE164(draftWhatsapp) ? (
            <p role="alert" className="mt-1 text-[12.5px] text-danger">
              Include the country code, e.g. +91 98765 43210
            </p>
          ) : null}
          <label
            htmlFor="profile-whatsapp-consent"
            className={
              draftWhatsappOptIn
                ? 'mt-2 flex cursor-pointer items-start gap-2.5 rounded-md border-1.5 border-positive-mid bg-positive-soft px-3 py-2.5'
                : 'mt-2 flex cursor-pointer items-start gap-2.5 rounded-md border-1.5 border-line bg-surface-sunken px-3 py-2.5'
            }
          >
            <Checkbox
              id="profile-whatsapp-consent"
              checked={draftWhatsappOptIn}
              onCheckedChange={(v) => setDraftWhatsappOptIn(v === true)}
              disabled={!normalizeToE164(draftWhatsapp)}
              className="mt-0.5"
            />
            <span className="text-[13px] leading-snug text-ink-2">
              Send me WhatsApp updates about my engagement on this number. Untick to withdraw, or reply STOP on
              WhatsApp at any time.
            </span>
          </label>
        </SettingsRow>
        {emailDiffers ? (
          <SettingsRow label="Confirm" hint="Current password">
            <Label htmlFor="profile-email-password" className="sr-only">
              Current password to confirm email change
            </Label>
            <Input
              id="profile-email-password"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              required
              placeholder="Password to change email"
            />
          </SettingsRow>
        ) : null}
        {photo}
        <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          {!inline || dirty ? (
            <Button type="button" variant="quiet" size="sm" onClick={cancelEditProfile} disabled={savingProfile}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={savingProfile || (inline && !dirty)}>
            {savingProfile ? savingLabel : 'Save profile'}
          </Button>
        </div>
      </form>
    );
  };

  /** The password form, with the strength bar. `inline` (Settings) keeps it open. */
  const passwordForm = (inline: boolean) => (
    <form onSubmit={(e: FormEvent) => void onPasswordSubmit(e)}>
      <SettingsRow label="Current password">
        <Label htmlFor="current-password" className="sr-only">
          Current password
        </Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the first field when this form opens
          autoFocus={!inline}
        />
      </SettingsRow>
      <SettingsRow label="New password" hint="8 or more characters">
        <Label htmlFor="new-password" className="sr-only">
          New password
        </Label>
        <div className="grid gap-2">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordStrength value={newPassword} />
        </div>
      </SettingsRow>
      <SettingsRow label="Confirm password">
        <Label htmlFor="confirm-password" className="sr-only">
          Confirm new password
        </Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={passwordsDiffer}
          className={cn(confirmPassword && !passwordsDiffer && 'border-positive-mid')}
        />
        {passwordsDiffer ? <p className="mt-1 text-[12px] text-danger">Passwords do not match</p> : null}
      </SettingsRow>
      <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3 md:px-5">
        {!inline ? (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => {
              setEditingSecurity(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }}
            disabled={submittingPassword}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={
            submittingPassword || !currentPassword || newPassword.length < 8 || !confirmPassword || passwordsDiffer
          }
        >
          {submittingPassword ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </div>
    </form>
  );

  const savedChip = profileSaved ? (
    <Chip fixed tone="ok">
      Saved
    </Chip>
  ) : undefined;

  let body: ReactNode = null;
  if (active === 'profile') {
    body = (
      <ProfileCard
        id="profile"
        title={SECTION_LABEL.profile}
        meta={savedChip}
      >
        {loading ? loadingRows : profileForm(true, photoRow)}
      </ProfileCard>
    );
  } else if (active === 'security') {
    body = (
      <ProfileCard id="security" title={SECTION_LABEL.security}>
        {!editingSecurity ? (
          <SettingsRow label="Password">
            <span className="flex flex-wrap items-center gap-2">
              <span className="tracking-[0.18em] text-ink-muted" aria-label="Password set">
                ••••••••
              </span>
              <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={() => setEditingSecurity(true)}>
                Change password
              </Button>
            </span>
          </SettingsRow>
        ) : (
          passwordForm(false)
        )}
        {isStaff ? <MicrosoftSignInRow /> : null}
        <TwoStepRows />
        <DevicesRows onSignOutHere={signOutHere} />
        <SettingsRow label="Sign out" hint="On this device">
          <Button type="button" variant="secondary" size="sm" className="text-danger" onClick={signOutHere}>
            Sign out
          </Button>
        </SettingsRow>
      </ProfileCard>
    );
  } else if (active === 'notify') {
    body = (
      <NotificationsCard
        id="notify"
        title={SECTION_LABEL.notify}
        whatsappOn={Boolean(display.phoneE164 && display.whatsappOptIn)}
        email={display.email}
        whatsappNumber={display.phoneE164}
        userRole={display.role}
      />
    );
  } else if (active === 'email') {
    body = <OutlookMailboxCard onConnectedChange={setOutlookConnected} />;
  } else if (active === 'appearance') {
    body = <AppearanceSettings />;
  } else if (active === 'settings') {
    body = (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ProfileCard id="settings-profile" title="Profile" meta={savedChip}>
          {loading ? loadingRows : profileForm(true, photoRow)}
        </ProfileCard>
        <div className="grid min-w-0 gap-4">
          <ProfileCard id="settings-security" title="Security">
            {passwordForm(true)}
          </ProfileCard>
          <OutlookMailboxCard title="Outlook" onConnectedChange={setOutlookConnected} />
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <SEO title="Profile — VCFO Suite" description="Update your profile and password." path={path} />
      {/* R-09: the sidebar and the menu card already name the page, so the heading is for screen readers. */}
      <h1 className="sr-only">Profile</h1>

      <div>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav
            aria-label="Profile sections"
            className="rounded-md border-1.5 border-line bg-surface-raised p-2 md:sticky md:top-20"
          >
            <div className="flex items-center gap-2.5 border-b border-line-soft px-2 pb-3 pt-2">
              <UserFace
                src={display.avatarUrl}
                initials={loading ? '' : initials}
                alt=""
                className="h-9 w-9 flex-none bg-surface-sunken text-[13px] font-medium text-ink"
              />
              <span className="min-w-0">
                <b className="block truncate text-[14px] font-medium text-ink">
                  {loading ? (
                    <span className="inline-block h-3.5 w-24 animate-pulse rounded-mark bg-surface-sunken align-middle" aria-hidden />
                  ) : (
                    display.name || 'Your profile'
                  )}
                </b>
                <small className="block truncate text-[12px] text-ink-muted">{roleLabel}</small>
              </span>
            </div>
            <div ref={menuRef} className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] md:grid md:overflow-visible">
              {sections.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-current={active === k ? 'true' : undefined}
                  onClick={() => pick(k)}
                  className={
                    active === k
                      ? 'flex h-[34px] flex-none items-center whitespace-nowrap rounded-md bg-brand-soft px-2.5 text-left text-[14px] font-medium text-brand-text'
                      : 'flex h-[34px] flex-none items-center whitespace-nowrap rounded-md px-2.5 text-left text-[14px] text-ink-2 hover:bg-surface-sunken'
                  }
                >
                  {SECTION_LABEL[k]}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-w-0">{body}</div>
        </div>
      </div>
    </PageTransition>
  );
}
