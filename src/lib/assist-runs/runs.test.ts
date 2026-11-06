import { describe, expect, it } from 'vitest';
import { assistSetUp, assistWord, ingestSchema, ingestState, latestBySubject, stepNote, stepsToShow, type AssistRunDto } from './runs';

const run = (over: Partial<AssistRunDto> = {}): AssistRunDto => ({
  id: 'r1',
  engagementId: 'e1',
  subjectKind: 'filing',
  subjectKey: 'k1',
  form: 'GSTR-3B',
  state: 'running',
  steps: [],
  reference: null,
  fieldsWritten: null,
  mismatches: [],
  error: null,
  startedBy: null,
  startedAt: '2026-10-30T04:00:00.000Z',
  updatedAt: '2026-10-30T04:00:00.000Z',
  finishedAt: null,
  ...over,
});

describe('VCFO Assist runs', () => {
  it('turns on only with VCFO_ASSIST_ENABLED', () => {
    expect(assistSetUp({})).toBe(false);
    expect(assistSetUp({ VCFO_ASSIST_ENABLED: 'on' })).toBe(true);
  });

  it('words the state, and says when it is not set up', () => {
    expect(assistWord(null)).toEqual({ label: 'Not started', tone: 'idle' });
    expect(assistWord(run({ state: 'done' })).label).toBe('Reference recorded');
    expect(assistWord(run(), false).label).toBe('Not set up');
  });

  it('shows the five default steps until the extension reports its own', () => {
    expect(stepsToShow(null, 'GST portal', 'GSTR-3B').map((s) => s.title)).toEqual([
      'Sign in to the GST portal',
      'Open GSTR-3B',
      'Fill the details from VCFO',
      'Check the filled values',
      'Submit and record the reference',
    ]);
    const own = run({ steps: [{ title: 'Open SPICe+ Part A', state: 'done', at: '2026-10-30T04:32:00.000Z' }] });
    expect(stepsToShow(own, 'MCA', null)).toHaveLength(1);
    expect(stepsToShow(null, 'EPFO', null)[0]!.title).toBe('Sign in to the EPFO portal');
    expect(stepNote(own.steps[0]!)).toBe('Done · 10:02 am');
  });

  it('accepts the extension result post as is and closes the run', () => {
    const body = ingestSchema.parse({
      subjectKind: 'registration',
      subjectKey: 'reg-4',
      form: 'GST REG-01',
      srn: 'AA290001234567',
      status: 'submitted',
      capturedAt: '2026-10-30T05:00:00.000Z',
      fieldsWritten: 7,
      mismatches: [],
      recipeVersion: 3,
      fieldMapVersion: 5,
    });
    expect(ingestState(body)).toBe('done');
    expect(ingestSchema.safeParse({ state: 'running' }).success).toBe(false);
  });

  it('keeps the newest run per subject', () => {
    const m = latestBySubject([run({ id: 'new' }), run({ id: 'old' })]);
    expect(m.get('k1')?.id).toBe('new');
  });
});
