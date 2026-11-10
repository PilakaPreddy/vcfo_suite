import 'server-only';

import { gatherMyDay } from '@/lib/my-day/gather';
import { countMyDay, MY_DAY_LABEL } from '@/lib/my-day/rank';
import type { StaffAreaContext } from './staff-areas';
import { numberArg, type AskTool } from './types';

/**
 * Ask VCFO "plan my day" (IDEAS-PLAN section F): the same ranked list as the Today card and the
 * morning email, read through the caller's scoped repositories. Read-only. Rows carry company
 * names, titles, kinds and dates; never identity numbers or people's contact details.
 */
export const GET_MY_DAY_TOOL: AskTool<StaffAreaContext> = {
  definition: {
    name: 'getMyDay',
    description:
      'The caller\'s plan for today, ranked: overdue items first by days late, then due today, approvals waiting on them, client replies to review, expiries and notices within 7 days, stalled request lists, then other tasks. Use for "plan my day", "what should I do first", "what is on my plate today".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'How many top items to return, 1 to 20' } },
      required: [],
      additionalProperties: false,
    },
  },
  run: async ({ ctx, data }, input) => {
    try {
      const ranked = await gatherMyDay(ctx, { data, now: data.now });
      const limit = numberArg(input, 'limit', 8, 20);
      return {
        count: ranked.length,
        counts: countMyDay(ranked),
        top: ranked.slice(0, limit).map((item, i) => ({
          rank: i + 1,
          kind: MY_DAY_LABEL[item.kind],
          title: item.title,
          detail: item.detail ?? null,
          company: item.companyName,
          engagementId: item.engagementId,
          dueOn: item.dueOn ?? null,
        })),
      };
    } catch (error) {
      console.warn('[ask-vcfo] my day unavailable', error);
      return { error: 'not_available' as const };
    }
  },
};

/** Keyed like `STAFF_AREA_TOOLS`, so the pipeline can spread it into that map. */
export const MY_DAY_TOOLS: Record<string, AskTool<StaffAreaContext>> = { getMyDay: GET_MY_DAY_TOOL };
