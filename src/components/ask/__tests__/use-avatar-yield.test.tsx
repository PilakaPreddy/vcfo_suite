import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAvatarYield } from '@/components/ask/use-avatar-yield';

/** The robot ducks for controls in fixed or sticky layers only (owner report, 2 Nov 2026). */
function Probe({ onYield }: { onYield: (y: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { yieldOn } = useAvatarYield(ref, false);
  onYield(yieldOn);
  return (
    <div ref={ref} id="launch">
      <span className="vpl-char" />
    </div>
  );
}

const box = { left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

function setup(position: 'static' | 'fixed') {
  const host = document.createElement('div');
  host.style.position = position;
  const btn = document.createElement('button');
  host.appendChild(btn);
  document.body.appendChild(host);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(box);
  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [btn];
  return host;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useAvatarYield', () => {
  it.each([
    ['stays up over a button in the page flow', 'static', false],
    ['ducks over a button in a fixed layer', 'fixed', true],
  ] as const)('%s', (_name, position, expected) => {
    vi.useFakeTimers();
    setup(position);
    let last = !expected;
    render(<Probe onYield={(y) => (last = y)} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(last).toBe(expected);
  });
});
