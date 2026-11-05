'use client';

/**
 * Data for the client Profile page. Every section reads the same queries:
 * the profile (`/api/account/profile`), the notification preferences
 * (`/api/client/notification-prefs`) and the password change date
 * (`/api/client/account/password`). Changes are optimistic and roll back on failure.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPrefs, NotificationPrefsPatch } from '@/lib/client-portal/notification-prefs';
import { usePortal } from '../../../PortalProvider';
import { api } from '../common';
import { PROFILE_KEY } from '../NotificationsPage';

export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneE164: string | null;
  whatsappOptIn: boolean;
  whatsappStatus: string;
  avatarUrl: string | null;
};

const PREFS_KEY = ['client-portal', 'notification-prefs'] as const;
const PW_KEY = ['client-portal', 'password-changed'] as const;
const ACCOUNT_KEY = ['client-portal', 'account'] as const;

/** `/api/client/account`: the person's designation and reminder lead time (migration 0028). */
export type ClientAccount = { designation: string | null; remindDays: 7 | 3 | 1 | null };

export function useProfileData() {
  const { shell, toast } = usePortal();
  const qc = useQueryClient();
  const prof = useQuery({ queryKey: PROFILE_KEY, queryFn: () => api<{ profile: Profile }>('/api/account/profile') });
  const np = useQuery({ queryKey: PREFS_KEY, queryFn: () => api<{ prefs: NotificationPrefs }>('/api/client/notification-prefs') });
  const pwq = useQuery({ queryKey: PW_KEY, queryFn: () => api<{ changedAt: string | null }>('/api/client/account/password') });
  const acc = useQuery({ queryKey: ACCOUNT_KEY, queryFn: () => api<{ account: ClientAccount }>('/api/client/account') });
  const p = prof.data?.profile;

  /** Saves designation or remindDays; rolls back and toasts on failure. */
  const saveAccount = async (patch: Partial<ClientAccount>): Promise<boolean> => {
    const prev = qc.getQueryData<{ account: ClientAccount }>(ACCOUNT_KEY);
    if (prev) qc.setQueryData(ACCOUNT_KEY, { account: { ...prev.account, ...patch } });
    try {
      const r = await api<{ account: ClientAccount }>('/api/client/account', { method: 'PATCH', json: patch });
      qc.setQueryData(ACCOUNT_KEY, r);
      return true;
    } catch {
      if (prev) qc.setQueryData(ACCOUNT_KEY, prev);
      toast('Could not save that change');
      return false;
    }
  };

  const setProfile = (patch: Partial<Profile>) =>
    qc.setQueryData<{ profile: Profile }>(PROFILE_KEY, (o) => (o ? { profile: { ...o.profile, ...patch } } : o));

  /** PATCH needs the name every time; the rest is partial. */
  const patchProfile = (body: Record<string, unknown>) =>
    api('/api/account/profile', { method: 'PATCH', json: { name: p?.name ?? shell?.me.name ?? 'Client', ...body } });

  /** Saves one preference change; `undo` puts the old value back through the same path. */
  const savePref = (patch: NotificationPrefsPatch, opts?: { message?: string; undo?: NotificationPrefsPatch; onSaved?: () => void }) => {
    const prev = qc.getQueryData<{ prefs: NotificationPrefs }>(PREFS_KEY);
    if (prev)
      qc.setQueryData(PREFS_KEY, {
        prefs: {
          ...prev.prefs,
          email: { ...prev.prefs.email, ...(patch.email ?? {}) },
          whatsapp: { ...prev.prefs.whatsapp, ...(patch.whatsapp ?? {}) },
          quietHours: patch.quietHours ?? prev.prefs.quietHours,
          quietStart: patch.quietStart ?? prev.prefs.quietStart,
          quietEnd: patch.quietEnd ?? prev.prefs.quietEnd,
        },
      });
    api<{ prefs: NotificationPrefs }>('/api/client/notification-prefs', { method: 'PATCH', json: patch })
      .then((r) => {
        qc.setQueryData(PREFS_KEY, r);
        opts?.onSaved?.();
        if (opts?.message) {
          const back = opts.undo;
          toast(opts.message, back ? { undo: () => savePref(back) } : undefined);
        }
      })
      .catch(() => {
        if (prev) qc.setQueryData(PREFS_KEY, prev);
        toast('Could not save that change');
      });
  };

  const setChangedAt = (at: string) => qc.setQueryData(PW_KEY, { changedAt: at });
  const refreshShell = () => void qc.invalidateQueries({ queryKey: ['client-portal', 'shell'] });

  return {
    p,
    loading: prof.isLoading,
    failed: prof.isError,
    prefs: np.data?.prefs,
    changedAt: pwq.data?.changedAt ?? null,
    account: acc.data?.account,
    saveAccount,
    setProfile,
    patchProfile,
    savePref,
    setChangedAt,
    refreshShell,
  };
}

/** "Chrome on Windows" from this browser's user agent. */
export function thisDevice(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'this device';
  return `${b} on ${o}`;
}

/** "21:00" → "9 pm", "08:30" → "8:30 am". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suf = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suf}` : `${h12} ${suf}`;
}
