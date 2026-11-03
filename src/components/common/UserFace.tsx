'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  src?: string | null;
  initials: string;
  className?: string;
  alt?: string;
  /** Pick one of the seven soft tones from this name (prototype Avatar). */
  toneFrom?: string;
  /** On a navy bar: blurple 26 % with white initials. */
  onNavy?: boolean;
};

/* Seven soft tones for faces (prototype Avatar palette). */
const FACE_TONES = [
  'bg-brand-soft text-brand-text',
  'bg-info-soft text-info',
  'bg-identity-soft text-identity',
  'bg-waiting-soft text-waiting',
  'bg-warning-soft text-warning',
  'bg-positive-soft text-positive',
  'bg-upcoming-soft text-upcoming',
] as const;

/** The soft tone for a person's face, picked from the name so it stays the same everywhere. */
function faceTone(name: string): string {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % FACE_TONES.length;
  return FACE_TONES[idx]!;
}

/** Initials fallback when `src` is missing or the image fails to load. */
export function UserFace({ src, initials, className, alt = '', toneFrom, onNavy }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const show = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        onNavy ? 'bg-brand/[.26] text-white' : toneFrom ? faceTone(toneFrom) : null,
        className,
      )}
      aria-hidden={!alt}
    >
      {show ? (
        // Authenticated `/api/account/avatar` — not a remote CDN, so <img> is correct.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="select-none">{initials}</span>
      )}
    </span>
  );
}
