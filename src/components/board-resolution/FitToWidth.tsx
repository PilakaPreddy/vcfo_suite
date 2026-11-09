'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shows a fixed-width page (the rendered Word document, about 800px) whole
 * inside a narrower column: the page is scaled down to the column's width and
 * the box takes the scaled height, so it never spills under the column beside
 * it. A column wider than the page shows it at full size.
 */
export function FitToWidth({ children, className }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number | null }>({ scale: 1, height: null });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const available = outer.clientWidth;
      const natural = inner.scrollWidth;
      const scale = available > 0 && natural > available ? available / natural : 1;
      const height = inner.scrollHeight * scale;
      setFit((prev) =>
        Math.abs(prev.scale - scale) < 0.001 && prev.height !== null && Math.abs(prev.height - height) < 1
          ? prev
          : { scale, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className={cn('w-full min-w-0 overflow-hidden', className)}
      style={fit.height !== null ? { height: fit.height } : undefined}
    >
      <div
        ref={innerRef}
        className="mx-auto w-fit origin-top-left"
        style={fit.scale < 1 ? { transform: `scale(${fit.scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
