import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { PlannerBlock } from '@/lib/work/planner';

/**
 * The Planner calendar on FullCalendar (M6 G2): which events a viewer may pick up. The move
 * rules themselves are tested in `src/lib/work/calendar-moves.test.ts`.
 */

let role = 'intern';
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ user: { id: 'u1', role }, engagements: [] }) }));

const blocks: PlannerBlock[] = [
  { id: 'b1', itemKey: null, engagementId: null, title: 'Focus', startsAt: '2026-11-02T04:30:00.000Z', endsAt: '2026-11-02T05:30:00.000Z' },
];
const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/components/work/use-work', () => ({
  useTimeBlocks: () => ({ data: blocks, isLoading: false }),
  useTimeBlockActions: () => ({ create: mutation(), update: mutation(), remove: mutation() }),
  useWindowRequestActions: () => ({ create: mutation(), act: mutation() }),
  useWindowRequests: () => ({ data: [] }),
}));

const { PlannerCalendar } = await import('@/components/work/PlannerCalendar');
const { plannerItemKind } = await import('@/lib/work/calendar-moves');

const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
const items = [
  { key: 'filing:f1', title: 'GSTR-3B', companyName: 'Acme', dueYmd: '2026-11-03', overdue: false, source: 'filing' as const },
  { key: 'step:e1:s1', title: 'Name approval', companyName: 'Acme', dueYmd: '2026-11-04', overdue: false, source: 'step' as const, managerDated: true, window: { from: '2026-11-02', to: '2026-11-04' } },
  { key: 'task:t1', title: 'Call bank', companyName: 'Acme', dueYmd: '2026-11-05', overdue: false, source: 'task' as const },
];

function eventByText(container: HTMLElement, text: string): HTMLElement {
  return [...container.querySelectorAll<HTMLElement>('.vc-ev')].find((e) => e.textContent?.includes(text))!;
}

beforeEach(() => {
  role = 'intern';
});

describe('plannerItemKind', () => {
  it('locks filings as statutory and sends manager-dated items through a request', () => {
    expect(plannerItemKind({ source: 'filing', managerDated: true })).toBe('statutory');
    expect(plannerItemKind({ source: 'step', managerDated: true })).toBe('client-agreed');
    expect(plannerItemKind({ source: 'task' })).toBe('due');
  });
});

describe('PlannerCalendar', () => {
  const now = new Date('2026-11-02T06:00:00Z');

  it('lets a lead drag blocks and client-agreed items, never a statutory due date', () => {
    const { container } = render(<PlannerCalendar days={days} items={items} now={now} onOpenItem={vi.fn()} />);
    expect(eventByText(container, 'Focus').classList.contains('fc-event-draggable')).toBe(true);
    expect(eventByText(container, 'Name approval').classList.contains('fc-event-draggable')).toBe(true);
    expect(eventByText(container, 'GSTR-3B').classList.contains('fc-event-draggable')).toBe(false);
    expect(eventByText(container, 'Call bank').classList.contains('fc-event-draggable')).toBe(false);
  });

  it('keeps client-agreed items still for a manager, who changes them in the item', () => {
    role = 'manager';
    const { container } = render(<PlannerCalendar days={days} items={items} now={now} onOpenItem={vi.fn()} />);
    expect(eventByText(container, 'Name approval').classList.contains('fc-event-draggable')).toBe(false);
    expect(eventByText(container, 'Focus').classList.contains('fc-event-draggable')).toBe(true);
  });

  it('is read only on a lead page for their manager', () => {
    const { container } = render(<PlannerCalendar days={days} items={items} now={now} onOpenItem={vi.fn()} leadKey="lead-1" />);
    expect(container.querySelector('.fc-event-draggable')).toBeNull();
    expect(container.querySelector('[aria-label="To plan"]')).toBeNull();
  });

  it('has no tray of its own: tasks drag in from the to-do list', () => {
    const { container } = render(<PlannerCalendar days={days} items={items} now={now} onOpenItem={vi.fn()} />);
    expect(container.querySelector('[aria-label="To plan"]')).toBeNull();
    expect(container.querySelector('[data-plan-key]')).toBeNull();
  });
});
