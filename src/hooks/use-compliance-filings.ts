"use client";

import { useMemo } from 'react';

import type { ComplianceFiling } from '@/data/compliance';
import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { useCalendarChanges } from '@/hooks/use-watch';
import { computeAllFilings } from '@/lib/compliance/compliance-store';

export function useComplianceFilings(
  engagements: Engagement[],
  getStateForEngagement: (engagement: Engagement) => Record<string, ChecklistItemStateSlice>,
): ComplianceFiling[] {
  const changes = useCalendarChanges();
  return useMemo(() => {
    const checklistStates: Record<string, Record<string, ChecklistItemStateSlice>> = {};
    for (const engagement of engagements) {
      checklistStates[engagement.id] = getStateForEngagement(engagement);
    }
    return computeAllFilings(engagements, checklistStates, changes);
  }, [engagements, getStateForEngagement, changes]);
}
