'use client';

/**
 * Top bar, VCFO Spectrum (prototype src/components/shell/TopBar.tsx): 60 px, white, a 1.5 px
 * line under it. SBC logo, then the location trail ("Compliances / Filings", the last part
 * in ink 500), the 380 px search field with Ctrl K, the Before/After pill (desktop),
 * Announcements and Notifications (6 px square icon buttons, square red count) and the
 * theme switch. No profile and no Ask VCFO button in the top bar (R-45).
 */
import { Moon, Sun } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePortal } from './PortalProvider';
import { crumbsFor, activeKeyFor, portalHref } from './routes';
import { BeforeAfterPill, useBreakpoint, useShowBeforeAfter } from './Sidebar';

export function PortalTopBar({ onSearch, hasAnnouncements }: { onSearch: () => void; hasAnnouncements: boolean }) {
  const pathname = usePathname();
  const { shell, go, theme, toggleTheme, setDrawerOpen, crumbs } = usePortal();
  const showBa = useShowBeforeAfter();
  const bp = useBreakpoint();
  const { mid, crumb } = crumbsFor(pathname);
  const act = activeKeyFor(pathname);
  const notif = shell?.badges.notifications ?? 0;
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  /* The trail is the sidebar's words ("Compliances / Filings"). A page may set its own trail
     (for example a step page); otherwise the route gives an optional middle part and the page. */
  const trail = crumbs && crumbs.length ? crumbs : [...(mid ? [mid] : []), crumb];

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onSearch();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSearch]);

  return (
    <div className="cp-top" data-vp="top">
      <header className="tbar">
        <span className="tbar-mw">
          <button type="button" className="tbar-menu" data-vp-menu="" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16 M4 12h16 M4 18h16" />
            </svg>
          </button>
          {/* the VCFO mark next to the hamburger on phones (shell.js mobileLogo) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="vp-mlogo" src="/client-portal/vcfo-mark.webp" alt="VCFO Suite" />
        </span>
        <a
          href={portalHref('home')}
          aria-label="SBC home"
          className="tbar-logo"
          data-tip-below=""
          onClick={(e) => {
            e.preventDefault();
            go('home');
          }}
        >
          {/* The black-letter logo disappears on the dark top bar, so dark mode shows the white-letter lockup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tbar-logo-l" src="/client-portal/sbc-logo-top.webp" alt="SBC" style={{ height: 26, width: 'auto' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tbar-logo-d" src="/sbc-logo-dark.png" alt="SBC" style={{ height: 26, width: 'auto' }} />
        </a>
        <nav aria-label="Location" className="tbar-nav">
          <ol className="tbar-ol">
            {trail.map((c, i) => {
              const last = i === trail.length - 1;
              /* Phones show the page only. */
              const cls = last ? 'tbar-cur' : 'tbar-mid';
              return (
                <Fragment key={`${c}-${i}`}>
                  {i > 0 ? (
                    <li aria-hidden="true" className="tbar-sep tbar-mid">
                      /
                    </li>
                  ) : null}
                  <li className={cls} aria-current={last ? 'page' : undefined}>
                    {c}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>
        <div className="tbar-r">
          <button type="button" className="tbar-srch" aria-label="Search (Ctrl K)" data-tip-below="" onClick={onSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
              <path d="M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z M16 16l4 4" />
            </svg>
            <span className="tbar-sl">Search steps, filings, documents</span>
            <kbd className="tbar-kbd">Ctrl K</kbd>
          </button>
          {bp === 'desktop' && showBa ? (
            <div id="vp-ba-top" className="vp-ba-slot">
              <BeforeAfterPill />
            </div>
          ) : null}
          <button
            type="button"
            className={`tbar-ib${act === 'announcements' ? ' on' : ''}`}
            aria-label={hasAnnouncements ? 'Announcements, new' : 'Announcements'}
            data-tip-below=""
            onClick={() => go('announcements')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14 M8 6v8" />
            </svg>
            {hasAnnouncements && act !== 'announcements' ? <span className="tbar-dot" aria-hidden="true" /> : null}
          </button>
          <button
            type="button"
            className={`tbar-ib${act === 'notifications' ? ' on' : ''}`}
            aria-label={notif ? `Notifications, ${notif} unread` : 'Notifications'}
            data-tip-below=""
            onClick={() => go('notifications')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
            </svg>
            {notif > 0 ? (
              <span className="tbar-badge" aria-hidden="true">
                {notif > 99 ? '99+' : notif}
              </span>
            ) : null}
          </button>
          <button type="button" className="tbar-ib tbar-theme" aria-label={themeLabel} aria-pressed={theme === 'dark'} onClick={toggleTheme}>
            {/* Same icon rule as the staff ThemeToggle (K-14): moon in light, sun in dark. */}
            {theme === 'dark' ? <Sun width={16} height={16} strokeWidth={1.6} aria-hidden /> : <Moon width={16} height={16} strokeWidth={1.6} aria-hidden />}
          </button>
        </div>
      </header>
    </div>
  );
}
