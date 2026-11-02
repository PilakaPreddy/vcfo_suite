import { describe, expect, it } from 'vitest';
import { buildTopicReview, coverageGaps, REVIEW_CHECKLIST, topicUsage } from '@/lib/ask/topic-review';
import { getTopic, listTopics } from '@/lib/ask/topics';

const topics = listTopics();

describe('topic review pack', () => {
  const report = buildTopicReview({ topics });

  it('lists every topic in the summary and a section with the checklist per draft', () => {
    for (const t of topics) expect(report).toContain(`| ${t.slug} |`);
    const drafts = topics.filter((t) => t.status === 'draft');
    expect(report.split(REVIEW_CHECKLIST).length - 1).toBe(drafts.length);
    expect(report).toContain('### GST basics (`gst-basics`)');
  });

  it('puts topics used by client suggestions first', () => {
    const order = [...report.matchAll(/^### .+ \(`([a-z0-9-]+)`\)$/gm)].map((m) => m[1]);
    expect(order.indexOf('gst-basics')).toBeLessThan(order.indexOf('capital-structure'));
    expect(order.indexOf('capital-structure')).toBeLessThan(order.indexOf('doc-pan-card'));
    expect(order.indexOf('doc-pan-card')).toBeLessThan(order.indexOf('obligation-gst-gstr-3b'));
  });

  it('describes usage: suggestions, steps, documents, obligations, alternates', () => {
    expect(topicUsage(getTopic('gst-basics')!, { topics })).toMatchObject({ suggestions: ['client-gst'], steps: ['reg-4'] });
    expect(topicUsage(getTopic('doc-pan-card')!, { topics }).documents).toEqual(['panCardFinalUrl']);
    expect(topicUsage(getTopic('obligation-gst-gstr-3b')!, { topics }).obligation).toBe('gst-gstr-3b');
    expect(topicUsage(getTopic('fillip-llp-incorporation')!, { topics }).suggestions).toEqual(['client-spice-part-a (alternate)']);
  });

  it('reports coverage gaps', () => {
    const gaps = coverageGaps({ topics });
    expect(gaps.steps).toEqual([]);
    expect(gaps.documents).toEqual([]);
    expect(gaps.obligations.some((o) => o.startsWith('llp-form-11'))).toBe(true);
    expect(gaps.obligations.some((o) => o.startsWith('gst-gstr-3b'))).toBe(false);
    const fewer = coverageGaps({ topics: topics.filter((t) => t.slug !== 'subscribers' && t.slug !== 'doc-moa') });
    expect(fewer.steps).toEqual(['pre-16 — Subscriber Details']);
    expect(fewer.documents).toEqual(['moaSubscriptionSheetSignedUrl (expects topic doc-moa)']);
  });

  it('includes the field-help lines and is deterministic', () => {
    expect(report).toContain('| pre-15.din |');
    expect(report).toContain('0 of 24 reviewed');
    expect(buildTopicReview({ topics })).toBe(report);
  });
});
