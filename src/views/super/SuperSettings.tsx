'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import AccountSettings from '@/views/settings/AccountSettings';
import { FirmSettingsBody } from '@/views/firm-settings/FirmSettings';

/**
 * SUPER ADMIN SETTINGS — the sidebar's "Firm settings" and the account row both land here
 * (`roleSettingsPath('super_admin')`). The firm cards start at once (the firm settings store,
 * G-02), with no tab row over them.
 *
 * The profile (the existing `AccountSettings`, kept whole) opens for `?tab=profile`, the Outlook
 * connect return (`?outlook=`) and the profile section hashes (`#appearance` from the greeting card, and the others), so
 * every link that used to reach the profile still does. `/app/super/profile` is the profile on
 * its own page (prototype route).
 */
type TabKey = 'firm' | 'profile';

const PROFILE_HASHES = new Set(['profile', 'security', 'email', 'appearance']);
const PATH = '/app/super/settings';

function SuperSettingsInner() {
  const params = useSearchParams();
  const fromQuery: TabKey | null =
    params.get('tab') === 'profile' || params.has('outlook') ? 'profile' : params.get('tab') === 'firm' ? 'firm' : null;
  const [fromHash, setFromHash] = useState(false);

  // The hash only exists in the browser, so it is read after mount.
  useEffect(() => {
    if (fromQuery) return;
    const hash = window.location.hash.replace('#', '');
    if (PROFILE_HASHES.has(hash)) setFromHash(true);
  }, [fromQuery]);

  if (fromQuery === 'profile' || (!fromQuery && fromHash)) return <AccountSettings path={PATH} />;

  return (
    <PageTransition>
      <SEO title="Firm settings — VCFO Suite" description="The firm's profile, calendar, branding and reminders." path={PATH} />
      {/* R-09: the top bar crumb names the page; the heading stays for screen readers. */}
      <h1 className="sr-only">Firm settings</h1>
      <FirmSettingsBody />
    </PageTransition>
  );
}

export default function SuperSettings() {
  return (
    <Suspense fallback={null}>
      <SuperSettingsInner />
    </Suspense>
  );
}
