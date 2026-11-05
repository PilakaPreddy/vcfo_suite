import type { SuperInsightClient, SuperTeamManager } from './super-insights-model';

/**
 * REASSIGN SUGGESTIONS (P-189, prototype Team "Reassign" card).
 *
 * A short list of moves the super admin can make in one click, from stored data only:
 *
 *  1. A client with no manager goes to the manager with the most room (capacity less open
 *     items, below 80% load). With no capacity set anywhere, the manager with the fewest clients.
 *  2. A client with a manager and no project lead goes to that manager's lead with the fewest
 *     clients. The reason is the current step's due date when there is one.
 *  3. A manager above 80% of their capacity hands their lightest client (fewest open items) to
 *     the manager with the lowest load under 70%.
 *
 * Each client appears once, and the list stops at `limit`. Nothing is guessed: a manager with
 * no capacity set never counts as over or under.
 */

export interface ManagerLoad {
  open: number;
  capacity: number | null;
  pct: number | null;
}

export interface ReassignSuggestion {
  id: string;
  engagementId: string;
  companyName: string;
  kind: 'manager' | 'lead';
  /** The person the client leaves, or null when nobody holds it. */
  fromId: string | null;
  fromName: string;
  /** Profile id for a manager; `intern_id` for a lead (what `/api/super/assign` takes). */
  toId: string;
  toName: string;
  why: string;
  action: 'Assign' | 'Reassign';
}

const OVER = 80;
const UNDER = 70;

function shortDay(ymd: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd}T00:00:00Z` : ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function openItems(c: SuperInsightClient): number {
  return c.summary.ballInCourt.firm + c.summary.ballInCourt.client;
}

export function buildReassignSuggestions(params: {
  clients: SuperInsightClient[];
  managers: SuperTeamManager[];
  load: (managerId: string) => ManagerLoad | undefined;
  limit?: number;
}): ReassignSuggestion[] {
  const { clients, managers, load, limit = 6 } = params;
  const out: ReassignSuggestion[] = [];
  const used = new Set<string>();
  const push = (s: ReassignSuggestion) => {
    if (out.length >= limit || used.has(s.engagementId)) return;
    used.add(s.engagementId);
    out.push(s);
  };

  // Room per manager; it shrinks as suggestions hand clients out, so one manager is not picked for all.
  const room = new Map<string, number | null>();
  const count = new Map<string, number>();
  for (const m of managers) {
    const l = load(m.id);
    room.set(m.id, l?.capacity != null && (l.pct ?? 0) < OVER ? Math.max(0, l.capacity - l.open) : null);
    count.set(m.id, m.clients);
  }
  const anyCapacity = [...room.values()].some((r) => r !== null);

  const bestManager = (): SuperTeamManager | null => {
    let best: SuperTeamManager | null = null;
    for (const m of managers) {
      if (anyCapacity) {
        const r = room.get(m.id);
        if (r == null || r <= 0) continue;
        if (!best || r > (room.get(best.id) ?? 0)) best = m;
      } else if (!best || (count.get(m.id) ?? 0) < (count.get(best.id) ?? 0)) {
        best = m;
      }
    }
    return best;
  };

  // 1. No manager.
  for (const c of clients) {
    if (c.summary.managerId) continue;
    const to = bestManager();
    if (!to) break;
    const r = room.get(to.id);
    push({
      id: `manager:${c.summary.id}`,
      engagementId: c.summary.id,
      companyName: c.summary.companyName,
      kind: 'manager',
      fromId: null,
      fromName: 'No manager',
      toId: to.id,
      toName: to.name,
      why: r != null ? `Added ${shortDay(c.summary.createdAt)} · room for ${r}` : `Added ${shortDay(c.summary.createdAt)} · ${count.get(to.id) ?? 0} clients`,
      action: 'Assign',
    });
    if (r != null) room.set(to.id, Math.max(0, r - Math.max(1, openItems(c))));
    count.set(to.id, (count.get(to.id) ?? 0) + 1);
  }

  // 2. A manager and no project lead.
  const leadCount = new Map<string, number>();
  for (const m of managers) for (const l of m.leads) leadCount.set(l.id, l.clients);
  for (const c of clients) {
    if (!c.summary.managerId || c.summary.leadId) continue;
    const m = managers.find((x) => x.id === c.summary.managerId);
    const leads = (m?.leads ?? []).filter((l) => l.internId);
    if (!m || leads.length === 0) continue;
    const to = leads.reduce((a, b) => ((leadCount.get(b.id) ?? 0) < (leadCount.get(a.id) ?? 0) ? b : a));
    push({
      id: `lead:${c.summary.id}`,
      engagementId: c.summary.id,
      companyName: c.summary.companyName,
      kind: 'lead',
      fromId: null,
      fromName: 'No project lead',
      toId: to.internId!,
      toName: to.name,
      why: c.currentStepDue ? `Due ${shortDay(c.currentStepDue)}` : `${leadCount.get(to.id) ?? 0} clients with ${to.name}`,
      action: 'Assign',
    });
    leadCount.set(to.id, (leadCount.get(to.id) ?? 0) + 1);
  }

  // 3. Over capacity to under capacity.
  const pctOf = (id: string) => load(id)?.pct ?? null;
  const over = managers.filter((m) => (pctOf(m.id) ?? 0) > OVER).sort((a, b) => (pctOf(b.id) ?? 0) - (pctOf(a.id) ?? 0));
  for (const from of over) {
    const to = managers
      .filter((m) => m.id !== from.id && pctOf(m.id) !== null && pctOf(m.id)! < UNDER)
      .sort((a, b) => pctOf(a.id)! - pctOf(b.id)!)[0];
    if (!to) break;
    const theirs = clients
      .filter((c) => c.summary.managerId === from.id && !used.has(c.summary.id))
      .sort((a, b) => openItems(a) - openItems(b) || a.summary.companyName.localeCompare(b.summary.companyName));
    const pick = theirs[0];
    if (!pick) continue;
    push({
      id: `move:${pick.summary.id}`,
      engagementId: pick.summary.id,
      companyName: pick.summary.companyName,
      kind: 'manager',
      fromId: from.id,
      fromName: from.name,
      toId: to.id,
      toName: to.name,
      why: `${from.name} at ${pctOf(from.id)}% · ${to.name} at ${pctOf(to.id)}%`,
      action: 'Reassign',
    });
  }

  return out;
}
