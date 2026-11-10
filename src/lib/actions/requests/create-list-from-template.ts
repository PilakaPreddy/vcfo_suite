import 'server-only';

import { z } from 'zod';
import { REQUEST_TEMPLATES, getRequestTemplate, templateListTitle } from '@/data/request-templates';
import { createRequestListFromTemplate } from '@/db/repositories/request-lists';
import { requestsPageHref } from '@/lib/request-lists/model';
import { dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext } from '../types';

/**
 * Create a draft request list for a client from a template (IDEAS-PLAN wave 2, A). It changes a
 * shared record but nobody outside the firm sees a draft, so it is T2. Sending is its own T3 action.
 */
const TEMPLATE_IDS = REQUEST_TEMPLATES.map((t) => t.id) as [string, ...string[]];

const input = z.object({
  engagementId: z.string().min(1),
  templateId: z.enum(TEMPLATE_IDS),
  periodLabel: z.string().trim().max(60).optional(),
  dueOn: dayInput.optional(),
  /** The list title; defaults to the template title and period. */
  value: z.string().trim().max(200).optional(),
});
type Input = z.infer<typeof input>;

async function check(actx: ActionContext, value: Input) {
  const loaded = await loadEngagement(actx.auth, value.engagementId);
  if (!loaded) return { checked: unavailable(), companyName: null };
  const template = getRequestTemplate(value.templateId)!;
  const title = value.value?.trim() || templateListTitle(template, value.periodLabel);
  const today = actx.now.toISOString().slice(0, 10);
  const checked = recheckOf(
    [
      { rule: 'scope', ok: true },
      value.dueOn && value.dueOn < today ? { rule: 'date', ok: false, message: 'The due date is in the past.' } : { rule: 'date', ok: true },
    ],
    {
      oldValue: '',
      value: title,
      displayOld: '',
      displayNew: `${title} · ${template.items.length} items, reminders every ${template.cadenceDays} days once sent${value.dueOn ? ` · due ${value.dueOn}` : ''}`,
    },
  );
  return { checked, companyName: loaded.companyName };
}

export const createListFromTemplate = defineAction({
  name: 'requests.createListFromTemplate',
  description: `Create a draft request list for one client from a template (${REQUEST_TEMPLATES.map((t) => `${t.id}: ${t.title}`).join('; ')}). Nothing is sent to the client until the list is sent.`,
  capability: 'Start a client request list from a template (GST, TDS, ROC, audit PBC, incorporation)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  async preview(actx, value) {
    const { checked, companyName } = await check(actx, value);
    const { value: _title, ...target } = value;
    return oneRow({
      title: `New request list for ${companyName ?? 'the client'}`,
      tier: 'T2',
      engagementId: value.engagementId,
      action: 'requests.createListFromTemplate',
      target: jsonTarget(target),
      label: 'Request list (draft)',
      checked,
    });
  },
  recheck: async (actx, value) => (await check(actx, value)).checked,
  async execute(actx, value) {
    const list = await createRequestListFromTemplate(
      actx.auth,
      { engagementId: value.engagementId, templateId: value.templateId, periodLabel: value.periodLabel ?? null, dueOn: value.dueOn ?? null, title: value.value ?? null },
      actx.now,
    );
    return { ok: true, summary: `Created the draft list "${list.title}" with ${list.items.length} items`, href: `${requestsPageHref(actx.auth.role)}?list=${list.id}` };
  },
});
