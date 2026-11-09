/**
 * The live-portal switch (SAFETY.md G11). The mock portal runs on the local machine; any other
 * host is "live" and is refused unless Suite's catalog says `liveAllowed: true` and, when it lists
 * hosts, names this one. A missing or unreadable catalog counts as not allowed.
 */
import type { Catalog } from '../shared/types';

export const MOCK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost'];

export function isMockHost(host: string): boolean {
  return MOCK_HOSTS.includes(host.toLowerCase());
}

export function liveAllowedFor(catalog: Catalog | null | undefined, host: string): boolean {
  if (isMockHost(host)) return true;
  if (!catalog || catalog.liveAllowed !== true) return false;
  if (Array.isArray(catalog.liveHosts)) return catalog.liveHosts.map((h) => h.toLowerCase()).includes(host.toLowerCase());
  return true;
}

export const LIVE_BLOCKED_MESSAGE = 'Live portal use waits for the CS opinion. Runs go only against the mock portal until then.';
