import { useCallback, useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { AppContextValue } from '@/context/AppContext';
import {
  type AuthUser,
  initialsFromName,
  type Role,
  isValidDbRole,
  mapDbRoleToAppRole,
  type DbRole,
} from '@/lib/auth';
import { ownAvatarSrc } from '@/lib/account-avatar';
import { getSession, signIn as authJsSignIn, signOut as authJsSignOut, useSession } from 'next-auth/react';
import type { AppProviderStore } from './state';
import type { NotificationActions } from './use-notifications';

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: string;
  internId?: string;
  clientId?: string;
  hasAvatar?: boolean;
  avatarVersion?: number;
};

function authUserFromSessionUser(user: SessionUser | undefined): AuthUser | null {
  if (!user?.id || !user.email || !user.role || !isValidDbRole(user.role)) return null;
  const name = user.name?.trim() || user.email.split('@')[0];
  return {
    id: user.id,
    name,
    email: user.email,
    role: mapDbRoleToAppRole(user.role as DbRole),
    initials: initialsFromName(name),
    imageUrl: user.hasAvatar ? ownAvatarSrc(user.avatarVersion) : null,
    clientId: user.clientId,
    internId: user.internId,
  };
}

type SessionAuthParams = {
  queryClient: QueryClient;
} & Pick<
  AppProviderStore,
  | 'setUser'
  | 'setAuthLoading'
  | 'setNotifications'
  | 'setEngagements'
  | 'setClients'
  | 'setTasks'
  | 'setRequests'
  | 'setActivity'
  | 'setDbChecklistState'
> &
  Pick<NotificationActions, 'dismissedIdsRef' | 'deleteInflightRef'>;

/** The signed-in user from the Auth.js session, plus sign in, demo client sign in and sign out. */
export function useSessionAuth({
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
}: SessionAuthParams) {
  const { data: session, status: sessionStatus } = useSession();

  const hydrateFromSession = useCallback(async () => {
    try {
      const next = await getSession();
      setUser(authUserFromSessionUser(next?.user as SessionUser | undefined));
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [setUser, setAuthLoading]);

  useEffect(() => {
    if (sessionStatus === 'loading') {
      setAuthLoading(true);
      return;
    }
    setUser(authUserFromSessionUser(session?.user as SessionUser | undefined));
    setAuthLoading(false);
  }, [session, sessionStatus, setUser, setAuthLoading]);

  const signIn = useCallback<AppContextValue['signIn']>(async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return { error: 'Enter your work email and password to continue.' };
    }

    const result = await authJsSignIn('credentials', {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    if (result?.code === 'rate_limited') {
      return { error: 'Too many sign-in attempts. Wait fifteen minutes and try again.' };
    }
    if (result?.error) {
      return { error: "We couldn't sign you in. Check your email and password and try again." };
    }

    const session = await getSession();
    const authUser = authUserFromSessionUser(session?.user as SessionUser | undefined);
    if (!authUser) {
      await authJsSignOut({ redirect: false });
      setUser(null);
      return { error: 'No profile is linked to this account. Ask your firm admin to complete setup.' };
    }

    setUser(authUser);
    return { user: authUser };
  }, [setUser]);

  const signInAsClient = useCallback<AppContextValue['signInAsClient']>((clientId, name) => {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH !== 'true') {
      throw new Error('Demo client sign-in is off. Sign in with your issued client credentials.');
    }
    const u: AuthUser = {
      id: `client-${clientId}`,
      name,
      email: `${clientId}@client.demo`,
      role: 'client' as Role,
      initials: initialsFromName(name),
      clientId,
    };
    setUser(u);
    return u;
  }, [setUser]);

  const signOut = useCallback(async () => {
    await authJsSignOut({ redirect: false });
    queryClient.clear();
    dismissedIdsRef.current.clear();
    deleteInflightRef.current.clear();
    setUser(null);
    setNotifications([]);
    setEngagements([]);
    setClients([]);
    setTasks([]);
    setRequests([]);
    setActivity([]);
    setDbChecklistState({});
    // A full load so the shell never sits on its loading screen with no user. The proxy then
    // lets the signed-out request through to the login page.
    window.location.assign('/login');
  }, [
    queryClient,
    dismissedIdsRef,
    deleteInflightRef,
    setUser,
    setNotifications,
    setEngagements,
    setClients,
    setTasks,
    setRequests,
    setActivity,
    setDbChecklistState,
  ]);

  return {
    hydrateFromSession,
    signIn,
    signInAsClient,
    signOut,
  };
}
