'use client';

import { useState } from 'react';
import { SEO } from '@/components/SEO';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { AgendaLibrarySection } from '@/views/board-meetings/AgendaLibrarySection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SkeletonRows } from '@/components/ui/empty-state';
import { SuperPageError } from '@/components/super/parts/super-parts';
import { useApp } from '@/context/AppContext';
import { isFirmWideAdmin } from '@/lib/auth';
import { useFirmSettings } from './use-firm-settings';
import {
  BrandingSection,
  FirmProfileSection,
  ReminderSection,
  SettingsHistorySection,
  WorkingCalendarSection,
} from './sections';
import { IntegrationsSection, PeopleRolesSection, RolePermissionsSection, ServiceTargetsSection } from './sections-extra';

/**
 * FIRM SETTINGS (G-02, prototype `super/SettingsScreen`) — one store for the firm's name,
 * logo, contact details, timezone, working days, holidays and default reminder days.
 *
 * Shown to the super admin (under Firm settings) and to firm admins
 * (`/app/admin/firm-settings`). Every change saves through `/api/firm-settings`, which writes
 * an audit event per field, and the settings history reads those events back. People and
 * roles (with Add person), Roles and permissions, Service targets and Integrations are the
 * prototype's other cards (`sections-extra.tsx`). Only the super admin changes role
 * permissions; firm admins see the grid. Fees stay out of the page (R-37, no money).
 */
export function FirmSettingsBody() {
  const { user } = useApp();
  const canEdit = isFirmWideAdmin(user?.role);
  const isSuper = user?.role === 'super_admin';
  const { query, settings, history, save, uploadLogo, removeLogo, logoSrc } = useFirmSettings();
  // Board meetings: the agenda master the notice picker reads (docs/specs/board-meetings/PLAN.md).
  const [tab, setTab] = useState<'settings' | 'agenda'>('settings');

  if (query.isPending) return <SkeletonRows rows={8} />;
  if (query.isError || !settings) {
    return <SuperPageError title="Firm settings could not load" error={query.error} onRetry={() => void query.refetch()} />;
  }

  const onSave = (patch: Parameters<typeof save.mutate>[0]) => save.mutate(patch);

  const grid = (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        {canEdit ? <PeopleRolesSection /> : null}
        <FirmProfileSection key={settings.updatedAt ?? 'new'} settings={settings} canEdit={canEdit} save={onSave} saving={save.isPending} />
        <WorkingCalendarSection settings={settings} canEdit={canEdit} save={onSave} />
        {canEdit ? <RolePermissionsSection settings={settings} canChange={isSuper} save={onSave} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <ServiceTargetsSection settings={settings} canEdit={canEdit} save={onSave} />
        <BrandingSection settings={settings} canEdit={canEdit} logoSrc={logoSrc} uploadLogo={uploadLogo} removeLogo={removeLogo} />
        <ReminderSection settings={settings} canEdit={canEdit} save={onSave} />
        {canEdit ? <IntegrationsSection isSuper={isSuper} /> : null}
        {canEdit ? <SettingsHistorySection rows={history} /> : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <SpectrumTabs
        variant="underline"
        label="Firm settings"
        value={tab}
        onChange={(k) => setTab(k as 'settings' | 'agenda')}
        items={[
          { key: 'settings', label: 'Settings' },
          { key: 'agenda', label: 'Agenda library' },
        ]}
      />
      {tab === 'agenda' ? <AgendaLibrarySection canEdit={canEdit} /> : grid}
    </div>
  );
}

/** The page form for `/app/admin/firm-settings`: a plain head over the body. */
export default function FirmSettings({ path }: { path: string }) {
  return (
    <PageTransition>
      <SEO title="Firm settings — VCFO Suite" description="The firm's profile, calendar, branding and reminders." path={path} />
      <div className="flex flex-col gap-4">
        <h1 className="text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">Firm settings</h1>
        <FirmSettingsBody />
      </div>
    </PageTransition>
  );
}
