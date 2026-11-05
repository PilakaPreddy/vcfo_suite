'use client';

import { useState } from 'react';
import { Landmark, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Sphere } from '@/data/labour-registers/types';
import { lr } from './theme';
import { LrCard, LrCardHead, LrChip } from './primitives';

/**
 * Whose rules this client is under.
 *
 * The Codes name an "appropriate government" per establishment, and it decides which registers
 * exist at all rather than which are due. The Centre governs railways, mines, oilfields, major
 * ports, banking, insurance, telecommunications, civil aviation and central public sector
 * undertakings. Everything else — which is nearly every ordinary commercial establishment — is
 * in the state sphere and is not subject to the Central Rules.
 *
 * It is asked once per client and then left alone. A shop does not become a railway.
 *
 * The wrong answer is not a harmless extra sheet. A central-code register produced for a shop
 * in Hyderabad carries an authority line citing rules that do not govern it, and an inspector
 * who reads that line will ask why it is there.
 */

const CENTRAL_EXAMPLES = 'railways · mines · oilfields · major ports · banking · insurance · telecom · civil aviation · central PSUs';

export function SphereCard({
  sphere,
  centralFormCount,
  busy = false,
  readOnly = false,
  onChange,
  className,
}: {
  sphere: Sphere;
  /** How many forms this choice adds or removes, so the consequence is visible. */
  centralFormCount?: number;
  busy?: boolean;
  /** True once the period is closed: the choice is part of what was locked. */
  readOnly?: boolean;
  onChange: (sphere: Sphere) => void;
  className?: string;
}) {
  const [pending, setPending] = useState<Sphere | null>(null);
  const shown = pending ?? sphere;

  function pick(next: Sphere) {
    if (readOnly || busy || next === sphere) return;
    setPending(next);
    onChange(next);
  }

  return (
    <LrCard className={className}>
      <LrCardHead
        icon={shown === 'central' ? Landmark : MapPin}
        tone={shown === 'central' ? 'blue' : 'reg'}
        label="Whose rules apply"
        right={<LrChip tone={shown === 'central' ? 'blue' : 'reg'}>{shown === 'central' ? 'Central' : 'State'}</LrChip>}
      />

      <ul className="m-0 list-none p-0">
        {([
          {
            key: 'state' as const,
            title: 'State',
            blurb:
              'An ordinary commercial establishment. The state Shops and Establishments rules govern its registers; the Central Rules do not reach it.',
          },
          {
            key: 'central' as const,
            title: 'Central',
            blurb: CENTRAL_EXAMPLES,
          },
        ]).map((option, i) => (
          <li key={option.key} className={i > 0 ? 'border-t border-[var(--lr-raised)]' : undefined}>
            <button
              type="button"
              disabled={readOnly || busy}
              onClick={() => pick(option.key)}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-left',
                shown === option.key && 'bg-[var(--lr-primary-soft)]',
                (readOnly || busy) && 'opacity-60',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border-[1.5px]',
                  shown === option.key
                    ? 'border-[var(--lr-primary)] bg-[var(--lr-primary)]'
                    : 'border-[var(--lr-line-2)]',
                )}
              >
                {shown === option.key ? <span className="size-1.5 rounded-full bg-white" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-[var(--lr-ink)]">{option.title}</span>
                <span className={cn(lr.small, 'mt-0.5 block')}>{option.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className={cn(lr.small, 'border-t border-[var(--lr-raised)] px-4 py-2.5')}>
        {readOnly ? (
          'The period is closed, so this is part of what was locked. Reopen the inputs to change it.'
        ) : centralFormCount !== undefined && centralFormCount > 0 ? (
          <>
            {shown === 'central'
              ? `${centralFormCount} central forms are being produced for this period.`
              : `${centralFormCount} central forms are not produced, because the Central Rules do not govern a state-sphere establishment.`}{' '}
            The state forms apply either way.
          </>
        ) : (
          'Asked once per client. A shop does not become a railway, so this rarely changes.'
        )}
      </p>
    </LrCard>
  );
}
