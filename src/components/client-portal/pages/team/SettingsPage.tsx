'use client';

/**
 * The client Profile page (prototype src/screens/shared/ProfileScreen.tsx, C-0027, K-16):
 * a 220 px left section menu, sticky from 768 px, with the person on top, and one section
 * on the right. Sections: About you, Sign-in and security, Notifications, Appearance,
 * Company, Team and Settings (the old Settings page: profile head, notification matrix,
 * appearance). Served at `/app/client/settings` and `/app/client/profile`.
 *
 * Deep links: `?tab=profile|security|notify|look|company|team|settings`. The older hashes
 * still work: `#notifications` opens Settings (the matrix), `#appearance` Appearance,
 * `#team` Team, `#security` Sign-in and security.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePortal } from '../../PortalProvider';
import { SELF_TINT, initialsOf } from './common';
import { TeamSection } from './team-sections';
import { FormSection, LABEL, type SecKey } from './profile/sections';
import { ClientSettingsView } from './profile/settings-view';
import { useProfileData } from './profile/use-profile';
import '../../css/team-00-contract.css';
import '../../css/team-settings.css';
import '../../css/team-team.css';

const SECS: SecKey[] = ['about', 'security', 'notify', 'look', 'company', 'team', 'settings'];
const TAB_ALIAS: Record<string, SecKey> = { profile: 'about' };
const HASH_ALIAS: Record<string, SecKey> = {
  profile: 'about',
  security: 'security',
  notifications: 'settings',
  appearance: 'look',
  team: 'team',
};

/** The section a URL names: `?tab=` first, then the older hash. */
function sectionFromUrl(search: string, hash: string): SecKey {
  const t = new URLSearchParams(search).get('tab') ?? '';
  const k = (TAB_ALIAS[t] ?? t) as SecKey;
  if (SECS.includes(k)) return k;
  return HASH_ALIAS[hash.replace(/^#/, '')] ?? 'about';
}

export function SettingsPage() {
  const { shell } = usePortal();
  const { p, account } = useProfileData();
  const [sec, setSec] = useState<SecKey>('about');

  useEffect(() => {
    const on = () => setSec(sectionFromUrl(window.location.search, window.location.hash));
    on();
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);

  const pick = (k: SecKey) => {
    setSec(k);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', k === 'about' ? 'profile' : k);
      u.hash = '';
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {
      /* the URL is a convenience only */
    }
  };

  const menu = useRef<HTMLDivElement>(null);
  // On phones the menu scrolls sideways: keep the picked section in view.
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sec]);

  const name = p?.name ?? shell?.me.name ?? '';
  const role = [account?.designation, shell?.companyShort || shell?.companyName].filter(Boolean).join(' · ');

  return (
    <div className="cp-team">
      <main className="pg tb-wrap tp-set">
        <h1 className="cp-tw sr-only">Profile</h1>
        <div className="pf-grid">
          <nav aria-label="Profile sections" className="cp-tw pf-nav rounded-md border-1.5 border-line bg-surface-raised p-2 md:sticky md:top-5">
            <div className="flex items-center gap-2.5 border-b border-line-soft px-2 pb-3 pt-2">
              <span
                className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full text-[13px] font-medium"
                style={p?.avatarUrl ? undefined : SELF_TINT}
                aria-hidden
              >
                {p?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initialsOf(name || ' ')
                )}
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[14px] font-medium text-ink">{name}</b>
                <small className="block truncate text-[12px] text-ink-muted">{role}</small>
              </span>
            </div>
            <div ref={menu} className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] md:grid md:overflow-visible">
              {SECS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-current={sec === k ? 'true' : undefined}
                  onClick={() => pick(k)}
                  className={cn(
                    'flex h-[34px] flex-none items-center whitespace-nowrap rounded-md px-2.5 text-left text-[14px]',
                    sec === k ? 'bg-brand-soft font-medium text-brand-text' : 'text-ink-2 hover:bg-surface-sunken',
                  )}
                >
                  {LABEL[k]}
                </button>
              ))}
            </div>
          </nav>

          {sec === 'team' ? (
            <div style={{ minWidth: 0 }}>
              <TeamSection />
            </div>
          ) : (
            <div className="cp-tw min-w-0">
              {sec === 'settings' ? <ClientSettingsView /> : <FormSection key={sec} sec={sec} onTeam={() => pick('team')} />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
