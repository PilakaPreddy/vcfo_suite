/*
 * App provider value — Auth.js session + TanStack Query over API/repositories.
 * Tasks, requests, activity, and notifications are Postgres-backed
 * (Phase 2). Clients still use localStorage seeds until a clients API exists.
 *
 * The concerns live in `./app-provider/`:
 *   state.ts                local reducer state and setters
 *   use-notifications.ts    bell: unread count, read, dismiss, restore, suppression
 *   use-server-sync.ts      TanStack queries and the effects that copy them into state
 *   use-session-auth.ts     session user, sign in, sign out
 *   use-activity-feed.ts    activity rows and checklist-diff notifications
 *   use-record-actions.ts   projects, tasks, document requests
 *   use-checklist-state.ts  checklist read access, refresh and merge
 *   checklist-mutations.ts  checklist writes (save, submit, unlock, review)
 */
"use client";

import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Client } from '@/data/client';
import type { AppContextValue } from '@/context/AppContext';
import { applySidebarCollapsed } from '@/components/shell/intern-sidebar';
import { initialsFromName, type Role } from '@/lib/auth';
import { useAppProviderState } from '@/context/app-provider/state';
import { useNotificationActions } from '@/context/app-provider/use-notifications';
import { useServerSync } from '@/context/app-provider/use-server-sync';
import { useSessionAuth } from '@/context/app-provider/use-session-auth';
import { useActivityFeed } from '@/context/app-provider/use-activity-feed';
import { useRecordActions } from '@/context/app-provider/use-record-actions';
import { useChecklistState } from '@/context/app-provider/use-checklist-state';
import { createChecklistMutations } from '@/context/app-provider/checklist-mutations';

export function useAppProviderValue(): AppContextValue {
  const queryClient = useQueryClient();
  const {
    user,
    authLoading,
    clients,
    engagements,
    tasks,
    requests,
    activity,
    notifications,
    sidebarMode,
    commandOpen,
    dbChecklistState,
    selectedClient,
    setUser,
    setAuthLoading,
    setClients,
    setEngagements,
    setTasks,
    setRequests,
    setActivity,
    setNotifications,
    setSidebarMode,
    setCommandOpen,
    setDbChecklistState,
    setSelectedClient,
  } = useAppProviderState();

  const {
    unreadNotificationCount,
    isNotificationSuppressed,
    suppressChecklistNotification,
    markNotificationRead,
    markAllNotificationsRead,
    dismissedIdsRef,
    deleteInflightRef,
    dismissNotifications,
    restoreNotifications,
  } = useNotificationActions({ user, queryClient, notifications, setNotifications });

  const { internOptions, teamMembers, internsLoading, engagementsLoading, engagementsSettled } = useServerSync({
    user,
    queryClient,
    dismissedIdsRef,
    setEngagements,
    setTasks,
    setRequests,
    setActivity,
    setDbChecklistState,
    setNotifications,
  });

  const { hydrateFromSession, signIn, signInAsClient, signOut } = useSessionAuth({
    queryClient,
    setUser,
    setAuthLoading,
    setNotifications,
    setEngagements,
    setClients,
    setTasks,
    setRequests,
    setActivity,
    setDbChecklistState,
    dismissedIdsRef,
    deleteInflightRef,
  });

  const { pushActivity, handleChecklistStateDiff } = useActivityFeed({
    user,
    queryClient,
    setActivity,
    setNotifications,
    isNotificationSuppressed,
  });

  const {
    createProjectWithClientFn,
    updateEngagementFn,
    updateTask,
    uploadDoc,
    approveDoc,
    createRequest,
  } = useRecordActions({
    user,
    queryClient,
    requests,
    setClients,
    setEngagements,
    setTasks,
    setRequests,
    pushActivity,
  });

  const {
    resolveEngagementForScope,
    refreshEngagementChecklist,
    mergeEngagementChecklistResponses,
    engagementChecklist,
    getState,
  } = useChecklistState({ engagements, dbChecklistState, setDbChecklistState, handleChecklistStateDiff });

  const addClient = useCallback(
    (partial: Omit<Client, 'id' | 'initials' | 'unread'>): Client => {
      const id = `c${Date.now()}`;
      const c: Client = { id, initials: initialsFromName(partial.name), unread: 0, ...partial };
      setClients((p) => [...p, c]);
      setSelectedClient(c);
      return c;
    },
    [setClients, setSelectedClient],
  );

  const sidebarCollapsed = sidebarMode !== 'open';
  const toggleSidebar = useCallback(
    () => setSidebarMode((mode) => (mode === 'open' ? 'auto' : 'open')),
    [setSidebarMode],
  );
  const collapseSidebarTo = useCallback(
    (collapsed: boolean) =>
      setSidebarMode((mode) => applySidebarCollapsed(mode, collapsed)),
    [setSidebarMode],
  );

  const value = useMemo<AppContextValue>(() => ({
    user, authLoading, signIn, signInAsClient, signOut, refreshAuth: hydrateFromSession,
    clients, engagements, tasks, requests, activity, notifications,
    unreadNotificationCount, markNotificationRead, markAllNotificationsRead,
    dismissNotifications, restoreNotifications,
    suppressChecklistNotification, teamMembers,
    createProjectWithClient: createProjectWithClientFn, updateEngagement: updateEngagementFn,
    updateTask, uploadDoc, approveDoc, createRequest,
    internOptions, internsLoading, engagementsLoading, engagementsSettled,
    sidebarCollapsed, sidebarMode, setSidebarMode, toggleSidebar, setSidebarCollapsed: collapseSidebarTo,
    commandOpen, setCommandOpen,
    role: (user?.role as Role) || 'admin',
    selectedClient,
    setSelectedClient,
    addClient,
    getState,
    getStateForEngagement: engagementChecklist,
    ...createChecklistMutations({
      user,
      engagements,
      setEngagements,
      dbChecklistState,
      setDbChecklistState,
      resolveEngagementForScope,
      queryClient,
      suppressChecklistNotification,
      pushActivity,
    }),
    refreshEngagementChecklist,
    mergeEngagementChecklistResponses,
  }), [
    user,
    authLoading,
    clients,
    engagements,
    tasks,
    requests,
    activity,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotifications,
    restoreNotifications,
    suppressChecklistNotification,
    sidebarCollapsed,
    sidebarMode,
    commandOpen,
    selectedClient,
    engagementChecklist,
    refreshEngagementChecklist,
    mergeEngagementChecklistResponses,
    resolveEngagementForScope,
    dbChecklistState,
    signIn,
    signInAsClient,
    signOut,
    hydrateFromSession,
    createProjectWithClientFn,
    updateEngagementFn,
    updateTask,
    uploadDoc,
    approveDoc,
    createRequest,
    addClient,
    toggleSidebar,
    collapseSidebarTo,
    setSidebarMode,
    getState,
    internOptions,
    internsLoading,
    engagementsLoading,
    engagementsSettled,
    setCommandOpen,
    setSelectedClient,
    setEngagements,
    setDbChecklistState,
    pushActivity,
  ]);
  return value;
}
