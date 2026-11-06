/**
 * `npm run eval:fill:live [-- --out <path>]`: the golden set against the real extraction model (costs
 * tokens; run on demand, never in CI). Synthetic documents only. Reports the correct-field rate on
 * proposed rows, with a target of 98%, and writes to a client must stay at zero.
 */
import '../../../../scripts/load-env';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { askConfig } from '@/lib/ask/config';
import { addLlmUsage, getAskProvider, NO_LLM_USAGE } from '@/lib/ask/provider';
import { meterProvider } from '@/lib/ask/provider/meter';
import { estimateCostUsd } from '@/lib/ask/provider/pricing';
import { FILL_CASES } from './cases';
import { runFillCase, summarise, type CaseOutcome } from './run';

async function main() {
  const configured = await getAskProvider();
  if (!configured) throw new Error('No model key. Set ANTHROPIC_API_KEY in .env.local.');
  const provider = meterProvider(configured);
  const model = askConfig().models.extract;
  const outcomes: CaseOutcome[] = [];
  for (const fill of FILL_CASES) {
    try {
      const outcome = await runFillCase(fill, provider, model);
      outcomes.push(outcome);
      const wrong = outcome.proposed.filter((p) => !p.correct).map((p) => `${p.field}=${p.value}`);
      console.log(`${fill.id}: ${outcome.proposed.length} proposed, ${wrong.length} wrong${wrong.length ? ` (${wrong.join('; ')})` : ''}, missed ${outcome.missed.length}${outcome.missed.length ? ` (${outcome.missed.join('; ')})` : ''}${outcome.usedModel ? ', model read' : ', code read'}`);
    } catch (error) {
      console.error(`${fill.id}: failed`, error);
      process.exitCode = 1;
    }
  }
  const total = summarise(outcomes);
  const spend = provider.spend();
  const usage = spend.reduce((sum, s) => addLlmUsage(sum, s.usage), NO_LLM_USAGE);
  const cost = spend.reduce((sum, s) => sum + estimateCostUsd(s.model, s.usage), 0);
  const lines = [
    `Model: ${model}`,
    `Correct-field rate on proposed rows: ${(total.correctFieldRate * 100).toFixed(1)}% (${total.correct} of ${total.proposed}; target 98%)`,
    `Expected fields found: ${(total.found * 100).toFixed(1)}%`,
    `Wrong-client writes: ${total.wrongClientWrites}`,
    `Raw identity values on a card: ${total.rawLeaks}`,
    `Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out; about $${cost.toFixed(4)}`,
  ];
  console.log(`\n${lines.join('\n')}`);
  const out = process.argv.indexOf('--out');
  if (out > 0 && process.argv[out + 1]) {
    const file = process.argv[out + 1]!;
    mkdirSync(path.dirname(file), { recursive: true });
    const rows = outcomes.map((o) => `| ${o.id} | ${o.usedModel ? 'model' : 'code'} | ${o.proposed.length} | ${o.proposed.filter((p) => !p.correct).map((p) => p.field).join(', ') || 'none'} | ${o.missed.map((m) => m.split('=')[0]).join(', ') || 'none'} |`);
    writeFileSync(file, `# Data router live eval, ${new Date().toISOString().slice(0, 10)}\n\nSynthetic documents only.\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n| Case | Read by | Proposed | Wrong | Missed |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
  }
}

void main();
