import { useEffect, useMemo, useState } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { TaskInstance, DocRequest, Invite, ActivityEvent } from '@/data/engagements';
import { type AuthUser, isAdminOrManager } from '@/lib/auth';
import {
  fetchEngagements,
  fetchChecklistIndex,
  fetchInternOptions,
  fetchEngagementByClientUser,
  fetchChecklistState,
} from '@/lib/projects/engagements-db';
import { mergeChecklistIndexIntoState } from '@/lib/checklist/checklist-index';
import { toastError, errorMessage, EMAIL_DISPATCH_NOTIFICATIONS_EVENT } from '@/lib/toast-errors';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';
import { fingerprintHead, useInvalidateOnHeadChange } from '@/lib/notifications/live-poll';
import { fetchJson } from './fetch-json';
import { EMPTY_INTERN_OPTIONS, preferUnchangedList, type AppProviderStore } from './state';
import type { NotificationActions } from './use-notifications';

type ServerSyncParams = {
  user: AuthUser | null;
  queryClient: QueryClient;
  dismissedIdsRef: NotificationActions['dismissedIdsRef'];
} & Pick<
  AppProviderStore,
  | 'setEngagements'
  | 'setTasks'
  | 'setRequests'
  | 'setInvites'
  | 'setActivity'
  | 'setDbChecklistState'
  | 'setNotifications'
>;

/**
 * Server state: the TanStack queries (engagements, checklist index, interns,
 * tasks, requests, invites, activity, notifications and its live head poll)
 * and the effects that copy their results into the provider state.
 */
export function useServerSync({
  user,
  queryClient,
  dismissedIdsRef,
  setEngagements,
  setTasks,
  setRequests,
  setInvites,
  setActivity,
  setDbChecklistState,
  setNotifications,
}: ServerSyncParams) {
  /* A developer may call only the developer console routes; every other guard returns 401
     and fetchJson signs the person out on a 401, so the firm data sync stays off for them. */
  // A client partner (receivables) likewise reads only /api/receivables/partner/*.
  const syncUser = user?.role === 'developer' || user?.role === 'partner' ? null : user;

  const engagementsQuery = useQuery({
    queryKey: ['engagements', user?.id],
    queryFn: async () => fetchEngagements(),
    enabled: Boolean(syncUser),
    staleTime: 30_000,
  });

  const clientHasEngagement = useMemo(() => {
    if (!user || user.role !== 'client' || !engagementsQuery.data) return true;
    return engagementsQuery.data.engagements.some(
      (e) => e.clientUserId === user.id || e.clientId === user.clientId,
    );
  }, [user, engagementsQuery.data]);

  const clientEngagementQuery = useQuery({
    queryKey: ['engagement-by-client', user?.id],
    queryFn: async () => {
      if (!user) return null;
      return fetchEngagementByClientUser(user.id, user.clientId);
    },
    enabled: Boolean(
      user?.role === 'client' &&
        engagementsQuery.isSuccess &&
        !clientHasEngagement,
    ),
    staleTime: 30_000,
  });

  const internsQuery = useQuery({
    queryKey: ['interns'],
    queryFn: async () => fetchInternOptions(),
    enabled: Boolean(isAdminOrManager(user?.role)),
    staleTime: 5 * 60_000,
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{ tasks: TaskInstance[] }>('/api/tasks');
      return data.tasks;
    },
    enabled: Boolean(syncUser),
    staleTime: 30_000,
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{ requests: DocRequest[] }>('/api/requests');
      return data.requests;
    },
    enabled: Boolean(syncUser),
    staleTime: 30_000,
  });

  const invitesQuery = useQuery({
    queryKey: ['invites', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{ invites: Invite[] }>('/api/invites');
      return data.invites;
    },
    enabled: Boolean(syncUser),
    staleTime: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: ['activity', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{ activity: ActivityEvent[] }>('/api/activity');
      return data.activity;
    },
    enabled: Boolean(syncUser),
    staleTime: 30_000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{ notifications: AppNotification[] }>('/api/notifications');
      return data.notifications;
    },
    enabled: Boolean(syncUser),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    notifyOnChangeProps: ['data', 'error'],
  });

  useInvalidateOnHeadChange({
    enabled: Boolean(syncUser?.id),
    headQueryKey: ['notifications-head', user?.id],
    queryFn: async () => {
      const data = await fetchJson<{
        latestId: string | null;
        unreadCount: number;
        count: number;
      }>('/api/notifications?head=1');
      return { fingerprint: fingerprintHead([data.latestId, data.unreadCount, data.count]) };
    },
    invalidateQueryKey: ['notifications', user?.id],
    exact: true,
  });

  const internOptions = internsQuery.data ?? EMPTY_INTERN_OPTIONS;
  const teamMembers = internOptions;
  const internsLoading = internsQuery.isLoading;
  const engagementsLoading = engagementsQuery.isLoading;
  /**
   * "Settled" means the fetched list is IN `engagements`, not merely fetched.
   * The query flips to success one render before the effect below copies its
   * rows into state; a guard reading `isSuccess` + an empty list on that
   * render redirected a hard refresh of a step page to the clients list.
   */
  const [appliedEngagementsData, setAppliedEngagementsData] =
    useState<typeof engagementsQuery.data>(undefined);
  const engagementsSettled =
    engagementsQuery.isError ||
    (engagementsQuery.isSuccess && appliedEngagementsData === engagementsQuery.data);
  const engagementIndexKey = (engagementsQuery.data?.engagements ?? []).map((e) => e.id).join(',');

  const checklistIndexQuery = useQuery({
    queryKey: ['checklist-index', user?.id, engagementIndexKey],
    queryFn: fetchChecklistIndex,
    enabled: Boolean(user) && engagementsQuery.isSuccess,
    staleTime: 30_000,
  });

  useEffect(() => {
    const next = engagementsQuery.data?.engagements;
    if (!next) return;
    setEngagements((prev) => preferUnchangedList(prev, next));
    setAppliedEngagementsData(engagementsQuery.data);
  }, [engagementsQuery.data, setEngagements]);

  useEffect(() => {
    const next = tasksQuery.data;
    if (!next) return;
    setTasks((prev) => preferUnchangedList(prev, next));
  }, [tasksQuery.data, setTasks]);

  useEffect(() => {
    const next = requestsQuery.data;
    if (!next) return;
    setRequests((prev) => preferUnchangedList(prev, next));
  }, [requestsQuery.data, setRequests]);

  useEffect(() => {
    const next = invitesQuery.data;
    if (!next) return;
    setInvites((prev) => preferUnchangedList(prev, next));
  }, [invitesQuery.data, setInvites]);

  useEffect(() => {
    const next = activityQuery.data;
    if (!next) return;
    setActivity((prev) => preferUnchangedList(prev, next));
  }, [activityQuery.data, setActivity]);

  useEffect(() => {
    const next = checklistIndexQuery.data;
    if (!next) return;
    setDbChecklistState((prev) => mergeChecklistIndexIntoState(prev, next));
  }, [checklistIndexQuery.data, setDbChecklistState]);

  useEffect(() => {
    const data = notificationsQuery.data;
    if (!data) return;
    const next = data.filter((n) => !dismissedIdsRef.current.has(n.id));
    setNotifications((prev) => preferUnchangedList(prev, next));
  }, [notificationsQuery.data, setNotifications, dismissedIdsRef]);

  useEffect(() => {
    if (!user?.id) return;
    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
    };
    window.addEventListener(EMAIL_DISPATCH_NOTIFICATIONS_EVENT, onRefresh);
    return () => window.removeEventListener(EMAIL_DISPATCH_NOTIFICATIONS_EVENT, onRefresh);
  }, [queryClient, user?.id]);

  useEffect(() => {
    const solo = clientEngagementQuery.data;
    if (!solo) return;
    setEngagements((prev) =>
      prev.some((e) => e.id === solo.id) ? prev : [solo, ...prev],
    );
    void fetchChecklistState(solo.id)
      .then((cs) => {
        setDbChecklistState((prev) => ({ ...prev, [solo.id]: cs }));
      })
      .catch((checklistErr) => {
        toastError(
          "Couldn't load checklist answers",
          errorMessage(checklistErr, 'Refresh the page or try again in a moment.'),
        );
      });
  }, [clientEngagementQuery.data, setEngagements, setDbChecklistState]);

  useEffect(() => {
    if (!engagementsQuery.isError) return;
    toastError(
      "Couldn't load projects",
      errorMessage(engagementsQuery.error, 'Refresh the page or try again in a moment.'),
    );
  }, [engagementsQuery.isError, engagementsQuery.error]);

  return {
    internOptions,
    teamMembers,
    internsLoading,
    engagementsLoading,
    engagementsSettled,
  };
}
