'use client';

import { visualSchema } from '@/data/ask/schema';
import { visualText } from '@/lib/ask/visual-text';
import { Bars } from './Bars';
import { Compare } from './Compare';
import { Flow } from './Flow';
import { KeyFacts } from './KeyFacts';
import { Metrics } from './Metrics';
import { NextStep } from './NextStep';
import { ProjectRows } from './ProjectRows';
import { Steps } from './Steps';
import { Timeline } from './Timeline';


/**
 * Parse-then-dispatch: anything that is not one of the fixed shapes renders
 * nothing (the answer stays text only).
 */
export function VisualRenderer({ visual }: { visual: unknown }) {
  const parsed = visualSchema.safeParse(visual);
  if (!parsed.success) return null;
  const v = parsed.data;
  // Flow and project rows carry their own accessible text; others add one here.
  const srText = v.type === 'flow' ? null : <p className="sr-only">{visualText(v)}</p>;
  let body: React.ReactNode;
  switch (v.type) {
    case 'flow':
      body = <Flow visual={v} />;
      break;
    case 'steps':
      body = <Steps visual={v} />;
      break;
    case 'compare':
      body = <Compare visual={v} />;
      break;
    case 'timeline':
      body = <Timeline visual={v} />;
      break;
    case 'keyFacts':
      body = <KeyFacts visual={v} />;
      break;
    case 'nextStep':
      body = <NextStep visual={v} />;
      break;
    case 'projectRows':
      body = <ProjectRows visual={v} />;
      break;
    case 'metrics':
      body = <Metrics visual={v} />;
      break;
    case 'bars':
      body = <Bars visual={v} />;
      break;
  }
  return (
    <div data-visual={v.type}>
      {srText}
      <div aria-hidden={v.type === 'flow' || v.type === 'projectRows' ? undefined : true}>{body}</div>
    </div>
  );
}
