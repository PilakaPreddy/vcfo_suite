/**
 * Robot avatar, inline SVG. `idle` blinks and bobs its antenna; `working` bounces, scans its eyes
 * and pulses the antenna light; `done` smiles. All motion stops under prefers-reduced-motion
 * (panel.css).
 */
export type RobotMood = 'idle' | 'working' | 'done' | 'blocked';

export function Robot({ color, mood = 'idle', size = 56, label }: { color: string; mood?: RobotMood; size?: number; label: string }) {
  return (
    <svg
      className={`robot robot-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      style={{ ['--robot' as string]: color }}
    >
      <g className="robot-antenna">
        <line x1="32" y1="5" x2="32" y2="14" stroke="var(--robot)" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="robot-bulb" cx="32" cy="5" r="3.5" fill="var(--robot)" />
      </g>
      <g className="robot-body">
        <rect x="11" y="14" width="42" height="30" rx="10" fill="var(--robot)" />
        <rect x="16" y="19" width="32" height="20" rx="7" fill="var(--robot-face)" />
        <g className="robot-eyes">
          {mood === 'done' ? (
            <>
              <path d="M22 29 q3 -4 6 0" stroke="var(--robot)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M36 29 q3 -4 6 0" stroke="var(--robot)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect className="robot-eye" x="22" y="25" width="6" height="7" rx="3" fill="var(--robot)" />
              <rect className="robot-eye" x="36" y="25" width="6" height="7" rx="3" fill="var(--robot)" />
            </>
          )}
        </g>
        <path
          d={mood === 'blocked' ? 'M27 36 h10' : 'M27 35 q5 3 10 0'}
          stroke="var(--robot)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="6" y="24" width="5" height="10" rx="2.5" fill="var(--robot)" />
        <rect x="53" y="24" width="5" height="10" rx="2.5" fill="var(--robot)" />
        <rect x="20" y="46" width="24" height="12" rx="5" fill="var(--robot)" opacity="0.85" />
        <circle className="robot-gear" cx="32" cy="52" r="3" fill="var(--robot-face)" />
      </g>
    </svg>
  );
}
