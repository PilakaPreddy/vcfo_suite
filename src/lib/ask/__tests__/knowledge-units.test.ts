import { describe, expect, it } from 'vitest';
import { buildCard, stripIdentityNumbers, type CardSource } from '@/lib/ask/index-cards/build';
import { buildRepoSources } from '@/lib/ask/ingest/repo-sources';
import { expandQuery } from '@/lib/ask/query-expand';
import { isStandingQuestion, questionKey } from '@/lib/ask/question-key';
import { fuseRanked } from '@/lib/ask/rank-fusion';
import { maySaveAnswer } from '@/lib/ask/saved-answer';
import { listTopics } from '@/lib/ask/topics';
import type { AnswerEnvelope } from '@/data/ask/schema';

describe('rank fusion', () => {
  const ids = (lists: string[][], limit = 4) => fuseRanked(lists.map((l) => l.map((id) => ({ id }))), limit).map((x) => x.id);

  it('lifts what two lists agree on above the top of either alone', () => {
    expect(ids([['a', 'b', 'c'], ['d', 'b', 'e']])[0]).toBe('b');
  });

  it('keeps list order on a tie and stops at the limit', () => {
    expect(ids([['a'], ['b'], ['c'], ['d'], ['e']])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives each id once, and copes with empty lists', () => {
    expect(ids([['a', 'a'], [], ['a']])).toEqual(['a']);
    expect(ids([[], []])).toEqual([]);
  });
});

describe('query widening', () => {
  it('adds the words the sources use for Hinglish and plain English', () => {
    expect(expandQuery('AOC-4 der se bharne ka jurmana')).toContain('penalty');
    expect(expandQuery('what if we miss the deadline')).toContain('late');
    expect(expandQuery('monthly sales return')).toContain('GSTR-1');
  });

  it('leaves a question it has nothing for untouched', () => {
    expect(expandQuery('registered office')).toBe('registered office');
  });
});

describe('question key', () => {
  it('folds case, punctuation and spacing, and nothing else', () => {
    expect(questionKey('  What is   AOC-4?? ')).toBe('what is aoc-4');
    expect(questionKey('What is AOC-4')).toBe(questionKey('what is aoc-4?'));
    expect(questionKey('What is AOC-4')).not.toBe(questionKey('What is AOC 4'));
    expect(questionKey('What is AOC-4')).not.toBe(questionKey('Explain AOC-4'));
  });

  it.each(['What is AOC-4?', 'What is the last date for DIR-3 KYC?', 'Who must file MGT-7?', 'AOC-4 der se bharne par kya jurmana lagta hai?', 'What is the penalty for late GSTR-3B?'])(
    'treats "%s" as standing',
    (q) => expect(isStandingQuestion(q)).toBe(true),
  );

  it.each([
    'What is my next step?',
    'Is our AOC-4 filed?',
    'What is pending today?',
    'What changed this month?',
    'What is overdue?',
    'What is the latest GST circular?',
    'What is due next month?',
    'Mera GST kab hai?',
    'Hamari filing ka status kya hai?',
    'Is mahine kya bharna hai?',
    'XXXXXX1234F ka kya hua?',
  ])('never saves "%s"', (q) => expect(isStandingQuestion(q)).toBe(false));
});

describe('record cards', () => {
  const base = { id: 's1', engagementId: 'e1', companyName: 'Acme Pvt Ltd', clientId: 'c1' };
  const task = (over: Partial<CardSource> = {}): CardSource => ({ ...base, kind: 'task', title: 'Chase DSC', body: null, ...over } as CardSource);

  it('takes identity numbers out of the title and the text, in any case', () => {
    const card = buildCard(task({ title: 'PAN abcde1234f check', body: 'Aadhaar 2345 6789 0123, passport A1234567, DIN: 01234567, PAN ABCDE1234F.' } as never));
    const all = `${card.title} ${card.cardText}`;
    for (const piece of ['abcde1234f', 'ABCDE1234F', '2345 6789', '0123', 'A1234567', '4567', '1234F']) expect(all).not.toContain(piece);
    expect(all).toContain('[number removed]');
    expect(stripIdentityNumbers('GSTIN 29ABCDE1234F1Z5 stays')).toContain('29ABCDE1234F1Z5');
  });

  it('holds what people wrote, never a status or an owner', () => {
    const card = buildCard(task({ body: 'Vendor said 48 hours.' } as never));
    expect(card).toMatchObject({ sourceKind: 'task', sourceId: 's1', engagementId: 'e1', clientId: 'c1' });
    expect(card.cardText).toBe('Task on Acme Pvt Ltd. Vendor said 48 hours.');
    expect(Object.keys(card)).not.toEqual(expect.arrayContaining(['status', 'assignedTo']));
  });

  it('keeps work tasks and staff notes away from clients', () => {
    expect(buildCard(task()).audience).toBe('staff');
    expect(buildCard({ ...base, kind: 'note', title: null, body: 'Client is slow.' }).audience).toBe('staff');
    expect(buildCard({ ...base, kind: 'request', title: 'Utility bill', body: null }).audience).toBe('both');
  });

  it('follows visibility on compliance tasks, and comments lean to staff', () => {
    const ct = (visibility: string) => buildCard({ ...base, kind: 'compliance_task', title: 'GST', body: null, visibility }).audience;
    expect([ct('firm'), ct('client'), ct('both')]).toEqual(['staff', 'both', 'both']);
    const comment = (internal: boolean, visibility: string) => buildCard({ ...base, kind: 'comment', title: 'GST', body: 'Done', internal, visibility }).audience;
    expect(comment(true, 'both')).toBe('staff');
    expect(comment(false, 'firm')).toBe('staff');
    expect(comment(false, 'both')).toBe('both');
  });

  it('a note has its first words as its title, and the hash follows the text', () => {
    const note = buildCard({ ...base, kind: 'note', title: null, body: 'Board meeting moved to Friday.' });
    expect(note.title).toBe('Board meeting moved to Friday.');
    expect(buildCard({ ...base, kind: 'note', title: null, body: 'Board meeting moved to Friday.' }).contentHash).toBe(note.contentHash);
    expect(buildCard({ ...base, kind: 'note', title: null, body: 'Board meeting moved to Monday.' }).contentHash).not.toBe(note.contentHash);
  });
});

describe('repository knowledge sources', () => {
  const sources = buildRepoSources(listTopics());
  const byTitle = (t: string) => sources.find((s) => s.title === t)!;

  it('builds the playbook, obligations, calendar and glossary, all with chunks', () => {
    for (const s of sources) expect(s.chunks.length, s.title).toBeGreaterThan(0);
    expect(byTitle('Firm playbook').chunks[0]).toContain('How the firm runs an incorporation');
    expect(byTitle('Compliance obligations and late-filing consequences').chunks.join('\n')).toContain('If late:');
  });

  it('dates the calendar to its financial year, and groups by act and month', () => {
    const calendar = byTitle('Statutory compliance calendar FY 2026-27');
    expect(calendar).toMatchObject({ effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31' });
    expect(calendar.chunks.some((c) => /due dates, May 2026/.test(c) && c.includes('7 May 2026'))).toBe(true);
  });

  it('merges both glossaries by term', () => {
    const glossary = byTitle('Compliance glossary').chunks;
    expect(glossary.filter((c) => /^GSTR-3B\b/.test(c))).toHaveLength(1);
    expect(glossary.find((c) => /^GSTR-3B\b/.test(c))).toContain('GST');
  });

  it('loads only reviewed topics with no legal-form or residency rule', () => {
    const [topic] = listTopics();
    const base = { ...topic!, status: 'published' as const, appliesTo: { ...topic!.appliesTo, legalForms: undefined, residency: undefined } };
    const titles = (t: typeof base) => buildRepoSources([t]).map((s) => s.title);
    expect(titles(base)).toContain(base.title);
    expect(titles({ ...base, status: 'draft' as never })).not.toContain(base.title);
    expect(titles({ ...base, appliesTo: { ...base.appliesTo, legalForms: ['llp'] as never } })).not.toContain(base.title);
  });
});

describe('what may be saved', () => {
  const answer = {
    line: 'AOC-4 is due within 30 days of the AGM.',
    citations: [{ id: 'chunk-1', label: 'Obligations' }],
    actions: [],
    origin: 'generated',
    depth: 'normal',
  } as unknown as AnswerEnvelope;
  const ok = { answer, path: 'document_answer', sources: [{ id: 'chunk-1', kind: 'chunk' as const, label: 'x', text: 'y' }], namedCompany: false, companyName: null };

  it('saves a cited document answer', () => expect(maySaveAnswer(ok)).toBe(true));

  it.each([
    ['tool answer', { path: 'tool_answer' }],
    ['router named a company', { namedCompany: true }],
    ['a record card among the sources', { sources: [{ id: 'c', kind: 'card' as const, label: 'x', text: 'y' }] }],
    ['no citation', { answer: { ...answer, citations: [] } }],
    ['the project snapshot cited', { answer: { ...answer, citations: [{ id: 'getProjectSnapshot', label: 'p' }] } }],
    ['a link into a project', { answer: { ...answer, links: [{ label: 'Open', dest: { to: 'project', engagementId: 'e' } }] } }],
    ['a step drawn from the project', { answer: { ...answer, visual: { type: 'nextStep' } } }],
    ['the company named in the text', { companyName: 'AOC-4 is due' }],
  ])('never saves with %s', (_name, over) => {
    expect(maySaveAnswer({ ...ok, ...(over as object) } as Parameters<typeof maySaveAnswer>[0])).toBe(false);
  });
});
