import 'server-only';

import type { AppRole } from '@/auth/guards';
import type { AnyAction } from './types';

/**
 * Every action area and its one index file. A pack adds actions only inside its own folder, so
 * parallel work never collides here. An empty list means the area has no action yet.
 */
const AREA_LOADERS = {
  tasks: () => import('./tasks'),
  requests: () => import('./requests'),
  reminders: () => import('./reminders'),
  documents: () => import('./documents'),
  statuses: () => import('./statuses'),
  checklist: () => import('./checklist'),
  compliance: () => import('./compliance'),
  registrations: () => import('./registrations'),
  'board-meetings': () => import('./board-meetings'),
  receivables: () => import('./receivables'),
  labour: () => import('./labour'),
  'client-portal': () => import('./client-portal'),
  filing: () => import('./filing'),
} satisfies Record<string, () => Promise<{ actions: AnyAction[] }>>;

export type ActionArea = keyof typeof AREA_LOADERS;

/** Refuses a misnamed or duplicate action, so the mistake fails the test run and the first load. */
export function indexActions(byArea: ReadonlyArray<readonly [string, readonly AnyAction[]]>): Map<string, AnyAction> {
  const index = new Map<string, AnyAction>();
  for (const [area, actions] of byArea) {
    for (const action of actions) {
      if (!action.name.startsWith(`${area}.`)) throw new Error(`Action ${action.name} is outside area ${area}`);
      if (index.has(action.name)) throw new Error(`Duplicate action ${action.name}`);
      index.set(action.name, action);
    }
  }
  return index;
}

let loading: Promise<Map<string, AnyAction>> | null = null;

function loadIndex(): Promise<Map<string, AnyAction>> {
  loading ??= Promise.all(
    Object.entries(AREA_LOADERS).map(async ([area, load]) => [area, (await load()).actions] as const),
  ).then(indexActions);
  return loading;
}

export async function getAction(name: string): Promise<AnyAction | null> {
  return (await loadIndex()).get(name) ?? null;
}

export async function actionsForRole(role: AppRole): Promise<AnyAction[]> {
  return [...(await loadIndex()).values()].filter((action) => action.roles.includes(role));
}
