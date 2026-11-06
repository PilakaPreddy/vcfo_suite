import { GLOSSARY as ASK_GLOSSARY } from '@/data/ask/glossary';
import { ASK_PLAYBOOK } from '@/data/ask/playbook';
import { GLOSSARY as FORM_GLOSSARY } from '@/data/glossary';
import { OBLIGATION_TEXTS } from '@/data/obligation-texts';
import { ACT_META, FY_END, FY_START, STATUTORY_DEADLINES } from '@/data/statutory-calendar-fy2627';
import type { Topic } from '@/data/ask/schema';
import { COMPLIANCE_OBLIGATIONS } from '@/lib/compliance/obligations-seed';

/**
 * The knowledge this repository holds, shaped as search sources with their own chunks: one chunk is
 * one obligation, one act's month or one glossary term, which retrieves far better than cutting the
 * lot by length. Pure, so `scripts/ask-load-knowledge.ts` can load it and a test can read it.
 */
export interface RepoSource {
  title: string;
  sourceType: 'govt' | 'firm_pdf' | 'firm_note';
  audience: 'client' | 'staff' | 'both';
  effectiveFrom?: string;
  effectiveTo?: string;
  chunks: string[];
}

function playbook(): RepoSource {
  const chunks = ASK_PLAYBOOK.split(/^(?=## )/m).map((part) => part.trim());
  return { title: 'Firm playbook', sourceType: 'firm_note', audience: 'both', chunks: chunks.filter(Boolean) };
}

function obligations(): RepoSource {
  const chunks = COMPLIANCE_OBLIGATIONS.flatMap((o) => {
    const text = OBLIGATION_TEXTS[o.id];
    return text ? [`${o.particular}\nAbout: ${text.about}\nWho must file and why it applies: ${text.whyItApplies}\nIf late: ${text.ifLate}`] : [];
  });
  return { title: 'Compliance obligations and late-filing consequences', sourceType: 'firm_note', audience: 'both', chunks };
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function statutoryCalendar(): RepoSource {
  const groups = new Map<string, typeof STATUTORY_DEADLINES>();
  for (const d of [...STATUTORY_DEADLINES].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${d.act}|${d.date.slice(0, 7)}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const chunks = [...groups.entries()].map(([key, deadlines]) => {
    const [act, month] = key.split('|') as [keyof typeof ACT_META, string];
    const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `${ACT_META[act].label} due dates, ${monthName}\n${deadlines.map((d) => `- ${longDate(d.date)}: ${d.title}`).join('\n')}`;
  });
  return {
    title: 'Statutory compliance calendar FY 2026-27',
    sourceType: 'firm_pdf',
    audience: 'both',
    effectiveFrom: FY_START,
    effectiveTo: FY_END,
    chunks,
  };
}

function glossary(): RepoSource {
  const terms = new Map<string, string>();
  for (const g of ASK_GLOSSARY) {
    const aliases = g.aliases?.length ? ` (${g.aliases.join(', ')})` : '';
    terms.set(g.term.toLowerCase(), `${g.term}${aliases}: ${g.short}`);
  }
  for (const g of FORM_GLOSSARY) {
    const known = terms.get(g.term.toLowerCase());
    terms.set(g.term.toLowerCase(), known ? `${known} ${g.text} ${g.by}.` : `${g.term}: ${g.text} ${g.by}.`);
  }
  return { title: 'Compliance glossary', sourceType: 'firm_note', audience: 'both', chunks: [...terms.values()] };
}

/**
 * A reviewed topic with no legal-form or residency rule. A restricted topic stays with the topic code,
 * which checks the rule per viewer; a search source has no such check.
 */
function reviewedTopics(topics: readonly Topic[]): RepoSource[] {
  return topics
    .filter((t) => t.status === 'published' && !t.appliesTo.legalForms?.length && !t.appliesTo.residency?.length)
    .map((t) => ({
      title: t.title,
      sourceType: 'firm_note' as const,
      audience: t.audience,
      chunks: [`${t.question}\n${t.body.detail}\nWhy it matters: ${t.body.why}`],
    }));
}

export function buildRepoSources(topics: readonly Topic[]): RepoSource[] {
  return [playbook(), obligations(), statutoryCalendar(), glossary(), ...reviewedTopics(topics)];
}
