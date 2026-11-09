/**
 * Demo data for the Variance tab and advance tax (docs/context/notes/budget.md), on the approved
 * Solstice Energy demo budget. Run after the budget demo seed:
 *
 *   node --conditions=react-server --import tsx scripts/seed-budget-variance-demo.ts
 *
 * It turns income tax on (cost plus, 18.5% mark-up, concessional regime), sets demo opening values
 * for the asset blocks and insurance premiums, then walks April to September through the real
 * repository code: the project lead fills and submits each month and the manager approves it.
 * October is left submitted, waiting for approval. Only the `demo-solstice-energy` budget changes.
 */
import './load-env';

import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { budgetActuals, budgets, budgetVarianceLog, budgetVarianceMonths, engagements, profiles } from '../src/db/schema';
import { actOnVarianceMonth, saveVarianceDraft } from '../src/db/repositories/budgets';
import { loadRows } from '../src/db/repositories/budgets/shared';
import type { AuthContext } from '../src/auth/guards';
import { computeBudget } from '../src/lib/budget/engine';
import { defaultAssetBlocks, periodOfFyIndex, withTaxDefaults, type BudgetSettings } from '../src/lib/budget/model';
import { monthBudget } from '../src/lib/budget/variance';

async function ctxFor(email: string): Promise<AuthContext> {
  const [p] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (!p) throw new Error(`Missing login ${email}. Run the demo seeds first.`);
  return { userId: p.id, email: p.email, name: p.name ?? p.email, role: p.role, internId: p.internId ?? undefined, clientId: p.clientId ?? undefined } as AuthContext;
}

/** A plain reason for a difference, so the demo reads like a real month. */
function reasonFor(lineName: string, budget: number, actual: number): string {
  if (actual > budget) return `${lineName} ran over: invoices came in higher than planned this month.`;
  return `${lineName} came in under: part of the spend moved to a later month.`;
}

async function main() {
  const [eng] = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.slug, 'demo-solstice-energy')).limit(1);
  if (!eng) throw new Error('Missing demo-solstice-energy. Run the demo seeds first.');
  const [budget] = await db.select().from(budgets).where(eq(budgets.engagementId, eng.id)).limit(1);
  if (!budget || budget.status !== 'approved') throw new Error('The Solstice demo budget is missing or not approved. Run scripts/seed-budget-demo.ts first.');
  const lead = await ctxFor('lead-divya@demo.vcfo.local');
  const manager = await ctxFor('pm-anita@demo.vcfo.local');

  /* Tax settings. The budget is approved, so the seed writes them directly. */
  const settings = budget.settings as BudgetSettings;
  const blocks = defaultAssetBlocks();
  blocks[0] = { ...blocks[0], openingIt: 18_00_000, openingCos: 21_50_000 };
  blocks[1] = { ...blocks[1], openingIt: 6_00_000, openingCos: 6_80_000 };
  blocks[2] = { ...blocks[2], openingIt: 3_00_000, openingCos: 3_40_000 };
  settings.tax = withTaxDefaults({ ...settings.tax, mode: 'cost_plus', preset: 'concessional_22', markupPct: 18.5, ratePct: 22, surchargePct: 10, surchargeBySlab: false, cessPct: 4, insuranceGroupPerYear: 18_000, insuranceWcPerYear: 0, assetBlocks: blocks });
  await db.update(budgets).set({ settings }).where(eq(budgets.id, budget.id));

  /* Start the Variance tab clean. */
  await db.delete(budgetVarianceLog).where(eq(budgetVarianceLog.budgetId, budget.id));
  await db.delete(budgetVarianceMonths).where(eq(budgetVarianceMonths.budgetId, budget.id));

  const state = { settings, rows: await loadRows(budget.id) };
  const result = computeBudget(state);
  for (let m = 0; m <= 6; m++) {
    const period = periodOfFyIndex(settings, m);
    const mb = monthBudget(state, result, m, null);
    const stored = await db.select().from(budgetActuals).where(and(eq(budgetActuals.budgetId, budget.id), eq(budgetActuals.period, period)));
    const byLine = new Map(stored.map((a) => [a.lineId, a]));
    const entries = settings.lines.map((l) => {
      const b = mb.lines[l.id] ?? 0;
      const a = byLine.get(l.id);
      const amount = a ? a.amount : b ? b : null;
      const reason = amount != null && Math.round(b - amount) !== 0 ? a?.reason || reasonFor(l.name, b, amount) : null;
      return { lineId: l.id, amount, reason };
    });
    const headcount = Math.max(0, Math.round(mb.headcount) - (m % 3 === 1 ? 1 : 0));
    const advanceTaxPaid = mb.advanceTax ? Math.round(mb.advanceTax / 1000) * 1000 : null;
    const advanceTaxReason = advanceTaxPaid != null && advanceTaxPaid !== Math.round(mb.advanceTax) ? 'Rounded to the nearest thousand when paid.' : null;
    await saveVarianceDraft(lead, budget.id, m, { entries, headcount, advanceTaxPaid, advanceTaxReason });
    await actOnVarianceMonth(lead, budget.id, m, 'submit', null);
    if (m < 6) await actOnVarianceMonth(manager, budget.id, m, 'approve', null);
    console.log(`${result.labels[m]}: ${m < 6 ? 'approved' : 'submitted'}`);
  }
  console.log('Variance demo ready on Solstice Energy.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
