import 'server-only';

import { z } from 'zod';
import { ClientHealthError, getClientHealth, setClientHealthOverride } from '@/db/repositories/client-health';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { isAdminOrManager } from '@/lib/auth';
import { HEALTH_BAND_LABEL, HEALTH_BANDS, type HealthBand } from '@/lib/client-health/score';
import { jsonTarget, loadEngagement, oneRow, recheckOf, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * Sets or clears the manual client health band (IDEAS-PLAN wave 2, section E). The nightly job
 * keeps computing the score; while an override is set the screens show the override band, with
 * the reason, beside the computed one. It changes a shared record, so it is a T2 card: the chat
 * and the health chip's "Set band" both propose it and a manager or admin approves it. The write
 * is `setClientHealthOverride`, which checks the role and the client's scope again.
 */

const input = z.object({
  engagementId: z.string().min(1),
  /** The band to show, or "clear" to go back to the computed band. */
  band: z.enum([...HEALTH_BANDS, 'clear']),
  reason: z.string().trim().max(500).optional(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  engagementId: string;
  previous: { band: HealthBand; reason: string | null } | null;
}

const ROLES = ['super_admin', 'admin', 'manager'] as const;

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  if (!isAdminOrManager(actx.auth.role)) return unavailable('Only a manager or an admin can set the health band.');
  const current = await getClientHealth(actx.auth, i.engagementId).catch(() => null);
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  checks.push(
    current
      ? { rule: 'computed', ok: true }
      : { rule: 'computed', ok: false, message: 'Held: the health score has not been computed for this client yet.' },
  );
  if (i.band !== 'clear' && !i.reason?.trim()) checks.push({ rule: 'reason', ok: false, message: 'Held: say why the band is being set by hand.' });
  const shown = current?.override ? `${HEALTH_BAND_LABEL[current.override.band]} (set by hand)` : current ? `${HEALTH_BAND_LABEL[current.band]} (computed, ${current.score})` : '';
  const next = i.band === 'clear' ? `${current ? HEALTH_BAND_LABEL[current.band] : 'Computed'} (computed)` : `${HEALTH_BAND_LABEL[i.band]}${i.reason ? `: ${i.reason}` : ''}`;
  return recheckOf(checks, {
    oldValue: current?.override?.band ?? '',
    value: i.band === 'clear' ? '' : i.band,
    displayOld: shown,
    displayNew: `${next} (${loaded.companyName})`,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  if (i.band !== 'clear' && !i.reason?.trim()) return { ok: false, error: 'Say why the band is being set by hand.' };
  try {
    const { item, previous } = await setClientHealthOverride(actx.auth, {
      engagementId: i.engagementId,
      band: i.band === 'clear' ? null : i.band,
      reason: i.reason ?? null,
    });
    const undo: UndoData = {
      engagementId: i.engagementId,
      previous: previous.override ? { band: previous.override.band, reason: previous.override.reason } : null,
    };
    const summary = item.override
      ? `${item.companyName}'s health band is now ${HEALTH_BAND_LABEL[item.override.band]} (set by hand)`
      : `${item.companyName}'s health band is back to the computed ${HEALTH_BAND_LABEL[item.band]}`;
    return { ok: true, summary, undo: undo as unknown as JsonValue };
  } catch (error) {
    if (error instanceof ClientHealthError) return { ok: false, error: error.message === error.code ? 'This client is not available.' : error.message };
    throw error;
  }
}

async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  try {
    await setClientHealthOverride(actx.auth, { engagementId: data.engagementId, band: data.previous?.band ?? null, reason: data.previous?.reason ?? null });
    return { ok: true, summary: data.previous ? `Put the health band back to ${HEALTH_BAND_LABEL[data.previous.band]}` : 'Cleared the health band override' };
  } catch (error) {
    if (error instanceof ClientHealthError) return { ok: false, error: 'The health record is no longer available.' };
    throw error;
  }
}

export const setClientHealth = defineAction({
  name: 'statuses.setClientHealth',
  description:
    'Set the client health band by hand (good, watch, at_risk or critical) with a reason, or "clear" to go back to the computed band. Use it when a manager or admin says a client is healthier or worse than the score shows, for example "mark Acme as at risk, the founder is unresponsive". A person approves it.',
  capability: 'Set or clear the client health band by hand, with a reason (after you approve it)',
  input,
  tier: 'T2',
  roles: ROLES,
  examples: [{ engagementId: 'e1', band: 'at_risk', reason: 'The founder has not replied for three weeks' }],
  async preview(actx, i) {
    const checked = await check(actx, i);
    return oneRow({
      title: 'Client health band',
      tier: 'T2',
      engagementId: i.engagementId,
      action: 'statuses.setClientHealth',
      target: jsonTarget(i),
      label: 'Health band',
      checked,
    });
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
