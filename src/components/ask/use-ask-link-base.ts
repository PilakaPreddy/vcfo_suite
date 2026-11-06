'use client';

import { useAskOptional } from './ask-context';
import { useApp } from '@/context/AppContext';
import { CLIENT_BASE, LEAD_BASE, type AskLinkBase } from '@/lib/ask/resolve-href';
import { staffBasePathForRole } from '@/lib/auth-routes';

/** Where an Ask link starts from for this person, including a super admin previewing the client chat. */
export function useAskLinkBase(): AskLinkBase {
  const { user } = useApp();
  const ask = useAskOptional();
  if (user?.role === 'client' || ask?.shell === 'client') return CLIENT_BASE;
  return user?.role === 'intern' ? LEAD_BASE : staffBasePathForRole(user?.role);
}
