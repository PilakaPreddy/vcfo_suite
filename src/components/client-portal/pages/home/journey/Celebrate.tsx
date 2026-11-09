'use client';

/**
 * A short confetti burst (about 1.5 s, 40 bits) the first time a journey stop shows as done.
 * Each stop is celebrated once per engagement (a localStorage key); with reduced motion the
 * stop is only marked as celebrated.
 */
import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import type { JStop } from './journey-model';
import { readStore, writeStore } from './status';

const BITS = 40;
const COLOURS = ['bg-data-1', 'bg-data-2', 'bg-data-3', 'bg-data-4', 'bg-data-5', 'bg-data-6', 'bg-positive-mid', 'bg-brand'];

/** A fixed pseudo-random spread, so render stays pure. */
const SPREAD = Array.from({ length: BITS }, (_, i) => {
  const a = (i / BITS) * Math.PI * 2 + (i % 3) * 0.4;
  const r = 70 + ((i * 37) % 90);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 - 40, rot: ((i * 53) % 360) - 180, delay: (i % 5) * 0.03, cls: COLOURS[i % COLOURS.length]! };
});

const keyFor = (engagementId: string, stop: JStop['id']) => `journey-celebrated:${engagementId}:${stop}`;

export function Celebrate({ engagementId, stops, reduce }: { engagementId?: string; stops: JStop[]; reduce: boolean }) {
  const [burst, setBurst] = useState<{ id: JStop['id']; label: string } | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    const stop = stops.find((s) => s.status === 'done' && s.total > 0 && !readStore(keyFor(engagementId, s.id)));
    if (!stop) return;
    writeStore(keyFor(engagementId, stop.id), '1');
    if (reduce) return;
    setBurst({ id: stop.id, label: stop.label });
  }, [engagementId, stops, reduce]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1700);
    return () => clearTimeout(t);
  }, [burst]);

  if (!burst) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center" aria-hidden>
      <div className="relative h-0 w-0">
        {SPREAD.map((b, i) => (
          <m.i
            key={i}
            className={`absolute block h-2 w-1.5 rounded-[1px] ${b.cls}`}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x: b.x, y: [0, b.y, b.y + 90], opacity: [1, 1, 0], rotate: b.rot, scale: 1 }}
            transition={{ duration: 1.5, delay: b.delay, ease: 'easeOut' }}
          />
        ))}
      </div>
    </div>
  );
}
