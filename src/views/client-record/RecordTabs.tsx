'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EngagementNotesPanel } from '@/components/notes/EngagementNotesPanel';
import { useEngagementNotes } from '@/components/notes/use-engagement-notes';
import { useApp } from '@/context/AppContext';
import type { Engagement } from '@/data/engagements';
import { ObligationsView } from '@/views/compliances/ObligationsView';
import { RegistrationsView } from '@/views/compliances/RegistrationsView';
import { preIncorporationIdsOf, type ComplianceScope } from '@/views/compliances/compliance-scope';
import { registrationRows } from '@/views/compliances/registration-rows';
import { RecordDocumentsPanel, useRecordDocuments } from '@/views/client-record/RecordDocuments';
import { DirectorsPanel } from '@/views/board-meetings/DirectorsPanel';

/**
 * CLIENT RECORD TABS (G-19, prototype ClientRecordScreen): the staff record of one client
 * switches in place (C-0032) between its incorporation steps (the record's own body, the
 * first tab), Registrations, Obligations, Directors (board meetings), Documents and Notes. Fees stay out (R-37).
 *
 * Registrations and Obligations are the staff list views from the Compliances module,
 * scoped to this one engagement and embedded, so a filter never leaves the record. Their
 * data are the same scoped reads: the roster's step state and `/api/registrations` for
 * one engagement; the register (`/api/filings`, `/api/client/compliances`) for
 * obligations. Notes are staff-only (`/api/engagements/<id>/notes`).
 *
 * The open tab is `?tab=` so a link can open the record on Notes; the first tab has no
 * parameter.
 */

export type RecordTabKey = 'overview' | 'registrations' | 'obligations' | 'directors' | 'documents' | 'notes';
const TABS: RecordTabKey[] = ['overview', 'registrations', 'obligations', 'directors', 'documents', 'notes'];

export function useRecordTab(): [RecordTabKey, (key: RecordTabKey) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('tab');
  const tab: RecordTabKey = TABS.includes(raw as RecordTabKey) ? (raw as RecordTabKey) : 'overview';
  const setTab = useCallback(
    (key: RecordTabKey) => {
      const next = new URLSearchParams(params.toString());
      if (key === 'overview') next.delete('tab');
      else next.set('tab', key);
      const q = next.toString();
      router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return [tab, setTab];
}

export function RecordTabBar({
  engagement,
  value,
  onChange,
  overviewLabel = 'Incorporation',
  overviewCount,
  className,
}: {
  engagement: Engagement;
  value: RecordTabKey;
  onChange: (key: RecordTabKey) => void;
  overviewLabel?: string;
  overviewCount?: string | number;
  className?: string;
}) {
  const { getStateForEngagement } = useApp();
  const notes = useEngagementNotes(engagement.id);
  const docs = useRecordDocuments(engagement.id);
  const regCount = useMemo(() => {
    const rows = registrationRows([engagement], getStateForEngagement, new Date());
    return rows.filter((r) => r.word !== 'Not needed').length;
  }, [engagement, getStateForEngagement]);

  return (
    <SpectrumTabs
      variant="underline"
      label="Record views"
      className={className}
      items={[
        { key: 'overview', label: overviewLabel, count: overviewCount },
        { key: 'registrations', label: 'Registrations', count: regCount },
        { key: 'obligations', label: 'Obligations' },
        { key: 'directors', label: 'Directors' },
        { key: 'documents', label: 'Documents', count: docs.data ? docs.data.length : undefined },
        { key: 'notes', label: 'Notes', count: notes.data ? notes.data.length : undefined },
      ]}
      value={value}
      onChange={(k) => onChange(k as RecordTabKey)}
    />
  );
}

/** The body of a non-overview tab. `shellBase` is `/app/admin`, `/app/manager` or `/app/intern`. */
export function RecordTabPanel({ tab, engagement, shellBase }: { tab: Exclude<RecordTabKey, 'overview'>; engagement: Engagement; shellBase: string }) {
  const { getStateForEngagement } = useApp();
  const scope = useMemo<ComplianceScope>(
    () => ({ audience: 'staff', engagements: [engagement], preIncorporationIds: preIncorporationIdsOf([engagement], getStateForEngagement) }),
    [engagement, getStateForEngagement],
  );
  if (tab === 'registrations') return <RegistrationsView shellBase={shellBase} scope={scope} embedded />;
  if (tab === 'obligations') return <ObligationsView basePath={`${shellBase}/compliances`} scope={scope} embedded />;
  if (tab === 'directors') return <DirectorsPanel engagementId={engagement.id} compliancesBase={`${shellBase === '/app/super' ? '/app/admin' : shellBase}/compliances`} />;
  if (tab === 'documents') return <RecordDocumentsPanel engagement={engagement} vaultHref={`${shellBase}/vault`} />;
  return <EngagementNotesPanel engagementId={engagement.id} />;
}
