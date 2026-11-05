import { useCallback, useReducer, type SetStateAction } from 'react';
import type { Client } from '@/data/client';
import {
  type Engagement,
  type TaskInstance,
  type DocRequest,
  type ActivityEvent,
  seedEngagements,
} from '@/data/engagements';
import type { AuthUser } from '@/lib/auth';
import type { EngagementChecklistState, InternOption } from '@/lib/projects/engagements-db';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';

export type AppProviderState = {
  user: AuthUser | null;
  authLoading: boolean;
  clients: Client[];
  engagements: Engagement[];
  tasks: TaskInstance[];
  requests: DocRequest[];
  activity: ActivityEvent[];
  notifications: AppNotification[];
  sidebarMode: 'auto' | 'open' | 'closed';
  commandOpen: boolean;
  dbChecklistState: Record<string, EngagementChecklistState>;
  selectedClient: Client | null;
};

type AppProviderAction = {
  type: 'patch';
  key: keyof AppProviderState;
  value: SetStateAction<AppProviderState[keyof AppProviderState]>;
};

function createInitialAppProviderState(): AppProviderState {
  return {
    user: null,
    authLoading: true,
    clients: [],
    engagements: seedEngagements,
    tasks: [],
    requests: [],
    activity: [],
    notifications: [],
    sidebarMode: 'auto',
    commandOpen: false,
    dbChecklistState: {},
    selectedClient: null,
  };
}

function appProviderReducer(state: AppProviderState, action: AppProviderAction): AppProviderState {
  const prev = state[action.key];
  const next =
    typeof action.value === 'function'
      ? (action.value as (current: typeof prev) => typeof prev)(prev)
      : action.value;
  if (Object.is(prev, next)) return state;
  return { ...state, [action.key]: next };
}

export const EMPTY_INTERN_OPTIONS: InternOption[] = [];
export const EMPTY_CHECKLIST_STATE: EngagementChecklistState = {};

/** Keep the previous array when every element is identical, so memoised consumers do not re-render. */
export function preferUnchangedList<T>(prev: T[], next: T[]): T[] {
  if (prev === next) return prev;
  if (prev.length !== next.length) return next;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return next;
  }
  return prev;
}

/** The provider's local state (one reducer) and a stable setter per key. */
export function useAppProviderState() {
  const [state, dispatch] = useReducer(appProviderReducer, undefined, createInitialAppProviderState);
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
  } = state;
  const setUser = useCallback((value: SetStateAction<AppProviderState['user']>) => {
    dispatch({ type: 'patch', key: 'user', value });
  }, [dispatch]);
  const setAuthLoading = useCallback((value: SetStateAction<AppProviderState['authLoading']>) => {
    dispatch({ type: 'patch', key: 'authLoading', value });
  }, [dispatch]);
  const setClients = useCallback((value: SetStateAction<AppProviderState['clients']>) => {
    dispatch({ type: 'patch', key: 'clients', value });
  }, [dispatch]);
  const setEngagements = useCallback((value: SetStateAction<AppProviderState['engagements']>) => {
    dispatch({ type: 'patch', key: 'engagements', value });
  }, [dispatch]);
  const setTasks = useCallback((value: SetStateAction<AppProviderState['tasks']>) => {
    dispatch({ type: 'patch', key: 'tasks', value });
  }, [dispatch]);
  const setRequests = useCallback((value: SetStateAction<AppProviderState['requests']>) => {
    dispatch({ type: 'patch', key: 'requests', value });
  }, [dispatch]);
  const setActivity = useCallback((value: SetStateAction<AppProviderState['activity']>) => {
    dispatch({ type: 'patch', key: 'activity', value });
  }, [dispatch]);
  const setNotifications = useCallback((value: SetStateAction<AppProviderState['notifications']>) => {
    dispatch({ type: 'patch', key: 'notifications', value });
  }, [dispatch]);
  const setSidebarMode = useCallback((value: SetStateAction<AppProviderState['sidebarMode']>) => {
    dispatch({ type: 'patch', key: 'sidebarMode', value });
  }, [dispatch]);
  const setCommandOpen = useCallback((value: SetStateAction<AppProviderState['commandOpen']>) => {
    dispatch({ type: 'patch', key: 'commandOpen', value });
  }, [dispatch]);
  const setDbChecklistState = useCallback((value: SetStateAction<AppProviderState['dbChecklistState']>) => {
    dispatch({ type: 'patch', key: 'dbChecklistState', value });
  }, [dispatch]);
  const setSelectedClient = useCallback((value: SetStateAction<AppProviderState['selectedClient']>) => {
    dispatch({ type: 'patch', key: 'selectedClient', value });
  }, [dispatch]);

  return {
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
  };
}

export type AppProviderStore = ReturnType<typeof useAppProviderState>;
