import { getActiveCatalogItems } from '@/data/checklist';
import {
  answerLinkSchema,
  CLIENT_DESTINATIONS,
  CLIENT_METRIC_LISTS,
  MAX_ANSWER_LINKS,
  STAFF_DESTINATIONS,
  type AnswerLink,
  type AskShell,
  type Destination,
} from '@/data/ask/schema';
import { getTopic } from '@/lib/ask/topics';

/**
 * Scope check for go-there links (§7.7). Runs on the server over every
 * answer, whoever wrote the link (a template or the model):
 *   - client shells get client places only; staff shells staff places only,
 *   - a step must be in the active catalog (never `reg-2` or other legacy rows),
 *   - a LOCKED step never opens its form: the link lands on Incorporation,
 *     focused on that step, where the gate's own "This opens after…" shows,
 *   - a staff link must name an engagement the caller can see.
 * Pure: callers pass what the caller may reach.
 */
export interface DestinationScope {
  shell: AskShell;
  /** Client: steps whose gate is `locked` for this client. */
  lockedStepIds?: ReadonlySet<string>;
  /** Staff: route keys (slug or id) of engagements in the caller's scope. */
  engagementKeys?: ReadonlySet<string>;
}

const ACTIVE = () => new Set(getActiveCatalogItems().map((i) => i.id));

export function checkDestination(dest: Destination, scope: DestinationScope): Destination | null {
  const client = scope.shell === 'client';
  const allowed: readonly string[] = client ? CLIENT_DESTINATIONS : STAFF_DESTINATIONS;
  if (!allowed.includes(dest.to)) return null;
  const active = ACTIVE();
  switch (dest.to) {
    case 'step':
      if (!active.has(dest.stepId)) return null;
      if (scope.lockedStepIds?.has(dest.stepId)) return { to: 'incorporation', focusStepId: dest.stepId };
      return dest;
    case 'incorporation':
      if (dest.focusStepId && !active.has(dest.focusStepId)) return { to: 'incorporation' };
      return dest;
    case 'learn':
      return getTopic(dest.slug) ? dest : null;
    case 'project':
    case 'composeReminder':
      return scope.engagementKeys?.has(dest.engagementId) ? dest : null;
    case 'projectStep':
      if (!scope.engagementKeys?.has(dest.engagementId)) return null;
      return active.has(dest.stepId) ? dest : { to: 'project', engagementId: dest.engagementId };
    case 'list':
      return !client || CLIENT_METRIC_LISTS.includes(dest.list) ? dest : null;
    default:
      return dest;
  }
}

/** Parse, scope-check, de-duplicate, cap at two and keep at most one primary. */
export function sanitizeLinks(raw: unknown, scope: DestinationScope): AnswerLink[] {
  if (!Array.isArray(raw)) return [];
  const out: AnswerLink[] = [];
  const seen = new Set<string>();
  let primaryTaken = false;
  for (const entry of raw) {
    const parsed = answerLinkSchema.safeParse(entry);
    if (!parsed.success) continue;
    const dest = checkDestination(parsed.data.dest, scope);
    if (!dest) continue;
    const key = JSON.stringify(dest);
    if (seen.has(key)) continue;
    seen.add(key);
    const primary = Boolean(parsed.data.primary) && !primaryTaken;
    if (primary) primaryTaken = true;
    // A locked step became "Incorporation, focused": say where it really goes.
    const label = parsed.data.dest.to === 'step' && dest.to === 'incorporation' ? 'Open Incorporation' : parsed.data.label;
    out.push({ dest, label, ...(primary ? { primary: true } : {}) });
    if (out.length >= MAX_ANSWER_LINKS) break;
  }
  // Primary first (§7.5).
  return out.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
}
