import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { listCodeRuleOverrides } from '@/db/repositories/labour-registers';
import { STATES } from '@/data/labour-registers/states';
import { codeRuleIndex, hybridFrom, oldestCheck, regimeLine, resolveCodeRules } from '@/lib/labour-registers/code-rules';
import { isAdminOrManager } from '@/lib/auth';
import type { CodeRulesView } from './CodeRulesPage';

/**
 * Every state and every code, with whichever reading governs.
 *
 * Configured states first, because those are the ones whose answer changes a filing this
 * month; the rest are listed so that adding a state is a question of recording its position
 * rather than discovering it is absent.
 */
export async function loadCodeRulesView(ctx: AuthContext): Promise<CodeRulesView> {
  const index = codeRuleIndex(await listCodeRuleOverrides(ctx));

  const states = STATES.map((state) => {
    const cells = resolveCodeRules(state.code, index);
    return {
      code: state.code,
      name: state.name,
      zone: state.zone,
      configured: state.configured,
      cells: cells.map((c) => ({
        code: c.code,
        title: c.title,
        short: c.short,
        stage: c.stage,
        on: c.on,
        source: c.source,
        lastVerified: c.lastVerified,
        note: c.note,
        fromFirm: c.fromFirm,
      })),
      regimeLine: regimeLine(cells),
      hybrid: hybridFrom(cells),
      oldestCheck: oldestCheck(cells),
    };
  }).sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));

  return {
    states,
    counts: {
      configured: states.filter((s) => s.configured).length,
      hybrid: states.filter((s) => s.configured && s.hybrid).length,
      unknown: states.reduce((n, s) => n + s.cells.filter((c) => c.stage === 'unknown').length, 0),
      fromFirm: states.reduce((n, s) => n + s.cells.filter((c) => c.fromFirm).length, 0),
    },
    canWrite: isAdminOrManager(ctx.role) || ctx.role === 'intern',
  };
}
