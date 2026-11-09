'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAskOptional } from './ask-context';

/**
 * Super admin "Preview Ask VCFO as a client" (§9): pick one engagement; the
 * panel then runs the client persona scoped to it, read-only (no saves, no
 * hand-offs), under a "Client view" banner.
 */
export function AskPreviewPicker() {
  const ask = useAskOptional();
  const { engagements } = useApp();
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return engagements
      .filter((e) => e.stage !== 'Operational Readiness')
      .filter((e) => !needle || e.companyName.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [engagements, q]);
  if (!ask || ask.shell !== 'super') return null;
  return (
    <div className="grid gap-2 rounded-md border-1.5 border-line bg-surface-raised p-3">
      <label htmlFor="ask-preview-search" className="block text-[13px] font-medium text-ink">
        Find a client
      </label>
      <input
        id="ask-preview-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Company name"
        className="h-control-md w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
      />
      <ul className="grid">
        {matches.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => ask.setPreview({ engagementId: e.id, companyName: e.companyName })}
              className="flex h-[34px] w-full items-center rounded-md px-2.5 text-left text-[14px] text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
            >
              {e.companyName}
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="rounded-md border-fine px-3 py-4 text-center text-[13px] text-ink-muted">
            No matching clients
          </li>
        )}
      </ul>
    </div>
  );
}
