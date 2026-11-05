import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepLink, StepMark } from './step-track';

describe('StepLink (R-58)', () => {
  it('centres both half-lines on the mark centre', () => {
    const { container } = render(
      <div className="relative">
        <StepLink x={11} y={11} up="done" down="todo" />
      </div>,
    );
    const up = container.querySelector('[data-step-link="up"]') as HTMLElement;
    const down = container.querySelector('[data-step-link="down"]') as HTMLElement;
    expect(up.style.left).toBe('11px');
    expect(down.style.left).toBe('11px');
    expect(up).toHaveClass('-translate-x-1/2', 'bg-positive-mid');
    expect(down).toHaveClass('-translate-x-1/2', 'bg-line');
    // The upper half ends at the mark centre; the lower half starts there.
    expect(up.style.height).toBe('calc(11px + 0px)');
    expect(down.style.top).toBe('11px');
  });

  it('draws nothing for a falsy half (first and last rows)', () => {
    const { container } = render(<StepLink x={21} up={false} down={undefined} />);
    expect(container.querySelectorAll('[data-step-link]')).toHaveLength(0);
  });
});

describe('StepMark (R-56, R-57)', () => {
  it('draws an upcoming step as a dashed empty square', () => {
    const { container } = render(<StepMark state="next" />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark).toHaveClass('border-line-strong', 'bg-surface-raised', 'relative');
    expect(mark).toHaveClass('border-dashed');
  });
});
