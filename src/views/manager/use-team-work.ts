'use client';

import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { useComplianceFilings } from '@/hooks/use-compliance-filings';
import type { Engagement } from '@/data/engagements';
import { buildTeamWork, teamWorkKpis, type TeamLead, type TeamWorkItem } from '@/views/manager/team-work';
import type { WorkTeam } from '@/views/intern/MyWork';

/** The lead key of a staff owner's own tasks (`useTeamWork` `owners`). */
const ownerKey = (profileId: string) => `profile:${profileId}`;

/**
 * The project leads' work on the caller's engagements (the server already scopes them: a
 * manager gets their own engagements, an admin every one). `leadKey` narrows it to one lead;
 * `managerId` to one manager's engagements (the admin Managers page).
 */
export function useTeamWork(opts: {
  projectBase: '/app/admin' | '/app/manager';
  leadKey?: string | null;
  managerId?: string | null;
  /**
   * Staff whose own assigned tasks join the items (the manager on their Work page, the picked
   * manager on the Managers page). Their items carry the lead key `profile:<id>`; they are not
   * offered as Reassign targets.
   */
  owners?: Array<{ profileId: string; name: string }>;
}) {
  const { engagements, requests, tasks, teamMembers, getStateForEngagement, engagementsLoading } = useApp();
  const scoped = useMemo(
    () =>
      opts.managerId
        ? engagements.filter((e) => (e.managerId ?? e.adminId) === opts.managerId)
        : engagements,
    [engagements, opts.managerId],
  );
  const filings = useComplianceFilings(scoped, getStateForEngagement);
  const now = useMemo(() => new Date(), []);

  const leads = useMemo(
    (): TeamLead[] =>
      (teamMembers as Array<{ id: string; name: string; profileId?: string }>).map((m) => ({
        id: m.id,
        name: m.name,
        profileId: m.profileId,
      })),
    [teamMembers],
  );

  const ownersKey = (opts.owners ?? []).map((o) => `${o.profileId}:${o.name}`).join('|');
  const all = useMemo(
    () =>
      buildTeamWork({
        engagements: scoped,
        getState: getStateForEngagement,
        filings,
        requests,
        tasks,
        leads: [
          ...leads,
          ...(ownersKey
            ? ownersKey.split('|').map((pair) => {
                const at = pair.indexOf(':');
                const profileId = pair.slice(0, at);
                return { id: ownerKey(profileId), name: pair.slice(at + 1), profileId };
              })
            : []),
        ],
        projectBase: opts.projectBase,
        now,
      }),
    [scoped, getStateForEngagement, filings, requests, tasks, leads, ownersKey, opts.projectBase, now],
  );
  const items = useMemo(
    () => (opts.leadKey ? all.filter((i) => i.leadId === opts.leadKey) : all),
    [all, opts.leadKey],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const kpis = useMemo(() => teamWorkKpis(items, now), [items, now]);
  const itemEngagements = useMemo((): Engagement[] => {
    const ids = new Set(items.map((i) => i.engagementId));
    return scoped.filter((e) => ids.has(e.id));
  }, [items, scoped]);
  /** Engagements the lead leads or co-leads, with or without open items. */
  const leadEngagements = useMemo(
    (): Engagement[] =>
      opts.leadKey
        ? scoped.filter((e) => e.internId === opts.leadKey || (e.leadIds ?? []).includes(opts.leadKey as string))
        : scoped,
    [scoped, opts.leadKey],
  );

  const team = (showLead: boolean, meProfileId?: string): WorkTeam => ({
    leads,
    byId,
    showLead,
    meKey: meProfileId ? ownerKey(meProfileId) : undefined,
  });

  return {
    items: items as TeamWorkItem[],
    all,
    byId,
    kpis,
    leads,
    engagements: itemEngagements,
    leadEngagements,
    scopedEngagements: scoped,
    filings,
    loading: engagementsLoading,
    now,
    team,
  };
}
