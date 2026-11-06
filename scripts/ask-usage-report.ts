/**
 * Prints Ask VCFO tokens per path, for the owner to run against a database (production included)
 * by setting DATABASE_URL. It only reads.
 *
 *   node --conditions=react-server --import tsx scripts/ask-usage-report.ts [days]
 */
import './load-env';

import type { AuthContext } from '@/auth/guards';
import { askUsageReport } from '@/db/repositories/ask-usage';
import { totalTokens } from '@/lib/ask/provider/pricing';

const REPORT_READER: AuthContext = { userId: 'script', email: 'script@local', name: 'Usage report', role: 'super_admin' };

async function main() {
  const days = Number(process.argv[2]) || 30;
  const report = await askUsageReport(REPORT_READER, { days });
  console.log(`Last ${days} days. Today ${report.todayTokens} of ${report.dailyBudget} budget. Off: ${report.killedPaths.join(', ') || 'nothing'}.`);
  console.table(
    report.rows.map((r) => ({
      path: r.path,
      messages: r.messages,
      calls: r.calls,
      input: r.inputTokens,
      cacheRead: r.cacheReadTokens,
      cacheWrite: r.cacheWriteTokens,
      output: r.outputTokens,
      perMessage: r.messages > 0 ? Math.round(totalTokens(r) / r.messages) : null,
      costUsd: Number(r.costUsd.toFixed(4)),
    })),
  );
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
