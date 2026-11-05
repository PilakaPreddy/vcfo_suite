import { describe, expect, it } from 'vitest';
import { listTopics } from '@/lib/ask/topics';
import { matchTopics, shortlistTopics } from '@/lib/ask/topic-match';

const slugs = (query: string, audience: 'client' | 'staff' = 'client') => shortlistTopics(query, audience).map((t) => t.slug);

describe('router shortlist', () => {
  it.each(listTopics().filter((t) => t.audience !== 'staff').map((t) => [t.slug, t.question] as const))(
    'keeps %s for its own question',
    (slug, question) => {
      expect(slugs(question)).toContain(slug);
    },
  );

  it.each([
    ['When do we have to file the annual return MGT-7?', 'obligation-mca-mgt-7'],
    ['how much advance tax do we pay in the first quarter', 'obligation-it-advance-tax-q1'],
    ['What office address does the company need to register?', 'registered-office'],
    ['difference between authorised capital and paid up capital', 'capital-structure'],
    ['Foreign investment reporting to RBI, FC-GPR', 'fc-gpr'],
    ['GST kya hai aur registration kaise hota hai', 'gst-basics'],
  ])('finds the topic for the paraphrase "%s"', (query, slug) => {
    expect(slugs(query)).toContain(slug);
  });

  it('sends about eight topics, not all of them', () => {
    expect(listTopics().length).toBeGreaterThan(30);
    expect(slugs('What is the GST return for this quarter, the tax, the form and the filing?').length).toBeLessThanOrEqual(8);
  });

  it('sends none when nothing overlaps, and the router then works without a list', () => {
    expect(slugs('Wie ist das Wetter?')).toEqual([]);
  });

  it('never offers a topic for another audience', () => {
    const staffOnly = listTopics().find((t) => t.audience === 'staff');
    if (staffOnly) expect(slugs(staffOnly.question, 'client')).not.toContain(staffOnly.slug);
    const clientOnly = listTopics().find((t) => t.audience === 'client');
    if (clientOnly) expect(slugs(clientOnly.question, 'staff')).not.toContain(clientOnly.slug);
  });
});

describe('answer sources', () => {
  it('respects the limit', () => {
    expect(matchTopics('What is the GST return and the tax filing?', null, 'client', 4).length).toBeLessThanOrEqual(4);
  });
});
