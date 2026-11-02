'use client';

/**
 * The owner's Ask VCFO character (v7-inputs/visor-avatar-animated.svg, smile
 * included) exactly as prototype proto.js draws it. Each instance gets its own
 * gradient / filter / clip ids. The bar under the visor was removed on 2 Nov 2026 at the
 * owner's request (it read as a second lip). The smile never changes; moods show only via the
 * antenna colour and motion (classes set by the chat).
 *
 *  - `VisorCharacter variant="loop"` — head clipped at the bottom edge, hands
 *    gripping it, the file's 20.5 s rise / look / blink / sink loop.
 *  - `VisorCharacter variant="peek"` — one peek over the chat window's top edge.
 *  - `VisorHead` — static head (chat header avatar, empty-state bots).
 */
import { useId } from 'react';

function Defs({ u, full }: { u: string; full: boolean }) {
  return (
    <defs>
      <linearGradient id={`${u}h`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4C8DF8" />
        <stop offset="1" stopColor="#1D4ED8" />
      </linearGradient>
      {full ? (
        <>
          <linearGradient id={`${u}k`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4C8DF8" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
          <clipPath id={`${u}c`}>
            <rect x="0" y="0" width="340" height="200" />
          </clipPath>
        </>
      ) : null}
      <filter id={`${u}g`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Face({ u }: { u: string }) {
  return (
    <>
      <line x1="120" y1="46" x2="120" y2="24" stroke="#1E40AF" strokeWidth="5" strokeLinecap="round" />
      <circle className="vpv-ant" cx="120" cy="18" r="8" fill="#2DD4BF" />
      <rect x="14" y="112" width="20" height="46" rx="10" fill="#1E40AF" />
      <rect x="206" y="112" width="20" height="46" rx="10" fill="#1E40AF" />
      <rect x="30" y="44" width="180" height="210" rx="56" fill={`url(#${u}h)`} />
      <path d="M62 56 q30 -10 60 -8" stroke="#fff" strokeOpacity=".28" strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="50" y="84" width="140" height="82" rx="36" fill="#0B1736" />
      <rect x="64" y="91" width="54" height="7" rx="3.5" fill="#fff" fillOpacity=".08" />
      <g className="vpv-eyes" filter={`url(#${u}g)`} fill="#7DD3FC">
        <rect className="vpv-eye" x="88" y="109" width="22" height="30" rx="11" />
        <rect className="vpv-eye" x="130" y="109" width="22" height="30" rx="11" />
        <path className="vpv-smile" d="M103 148 Q120 161 137 148" fill="none" stroke="#7DD3FC" strokeWidth="5" strokeLinecap="round" />
      </g>
    </>
  );
}

function Hand({ u, cls, x }: { u: string; cls: string; x: number }) {
  return (
    <g className={cls} transform={`translate(${x} 178)`}>
      <rect x="2" y="4" width="46" height="22" rx="11" fill={`url(#${u}k)`} stroke="#1D4ED8" strokeOpacity=".5" />
      <g fill="#1D4ED8">
        <rect x="6" y="18" width="8.5" height="17" rx="4.25" />
        <rect x="16" y="18" width="8.5" height="17" rx="4.25" />
        <rect x="26" y="18" width="8.5" height="17" rx="4.25" />
        <rect x="36" y="18" width="8.5" height="17" rx="4.25" />
      </g>
      <path d="M12 10 h18" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

export function VisorCharacter({ variant }: { variant: 'loop' | 'peek' }) {
  const u = useSvgId('vpv');
  return (
    <svg className={`vpv vpv-${variant}`} viewBox="0 0 340 216" aria-hidden="true" focusable="false">
      <Defs u={u} full />
      <g clipPath={`url(#${u}c)`}>
        <g transform="translate(50 0)">
          <g className="vpv-head">
            <g className="vpv-mood">
              <Face u={u} />
            </g>
          </g>
        </g>
      </g>
      <Hand u={u} cls="vpv-hand" x={4} />
      <Hand u={u} cls="vpv-hand vpv-hand-r" x={286} />
    </svg>
  );
}

export function VisorHead({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const u = useSvgId('vpvS');
  return (
    <svg className={`vpv vpv-s${className ? ` ${className}` : ''}`} viewBox="0 0 240 302" aria-hidden="true" focusable="false" style={style}>
      <Defs u={u} full={false} />
      <Face u={u} />
    </svg>
  );
}

/**
 * The robot's head in a round chip: the avatar beside each answer and in chat headers. The head
 * sits low in the circle so its face fills it, as in the prototype's chat header.
 */
export function VisorBadge({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`ask-vpv-scope grid flex-none place-items-center overflow-hidden rounded-full border border-line bg-surface-raised${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <VisorHead style={{ width: size * 0.86, height: size * 1.08, marginTop: size * 0.25 }} />
    </span>
  );
}
