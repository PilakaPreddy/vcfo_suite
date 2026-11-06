import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CLIENT_VISUAL_TYPES, STAFF_VISUAL_TYPES, visualSchema, type Visual } from '@/data/ask/schema';
import { visualText } from '@/lib/ask/visual-text';
import { Bars } from '../Bars';
import { VisualRenderer } from '../VisualRenderer';

const visual: Extract<Visual, { type: 'bars' }> = {
  type: 'bars',
  items: [{ k: 'GST', v: 8 }, { k: 'Income Tax', v: 4 }, { k: 'FEMA / RBI', v: 0 }],
};

describe('Bars', () => {
  it('sizes each bar against the largest and draws none for zero', () => {
    const { container } = render(<Bars visual={visual} />);
    const fills = [...container.querySelectorAll<HTMLElement>('.bg-data-1')];
    expect(fills.map((f) => f.style.width)).toEqual(['100%', '50%']);
    expect(screen.getByText('FEMA / RBI')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('has a text form for screen readers and the PDF', () => {
    expect(visualText(visual)).toBe('GST: 8. Income Tax: 4. FEMA / RBI: 0.');
    const { container } = render(<VisualRenderer visual={visual} />);
    expect(container.querySelector('[data-visual="bars"] .sr-only')?.textContent).toContain('GST: 8.');
  });

  it('is a shape only code may emit', () => {
    expect(visualSchema.safeParse(visual).success).toBe(true);
    expect(CLIENT_VISUAL_TYPES).not.toContain('bars');
    expect(STAFF_VISUAL_TYPES).not.toContain('bars');
  });
});
