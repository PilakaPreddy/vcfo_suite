'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, FileText } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/native-select';
import type { Statement } from '@/lib/receivables/statement';

/**
 * The Statement action at the top of the Reports tab (Phase 10): pick a client (or all) and open
 * the printable statement of account (/receivables/manager/statement) or download it as Excel
 * (`GET /api/receivables/sheets/:id/statement?format=xlsx`). Both start on the default period,
 * three months back to today; the statement page changes the dates. The client list comes from
 * the statement route itself, so the card needs nothing from the Reports data.
 */
export function StatementCard({ sheetId }: { sheetId: string }) {
  const [client, setClient] = useState('');
  const list = useQuery({
    queryKey: ['receivables', 'statement-clients', sheetId],
    queryFn: async () => {
      const res = await fetch(`/api/receivables/sheets/${sheetId}/statement`);
      if (!res.ok) return [] as string[];
      return ((await res.json()) as { statement: Statement }).statement.clients;
    },
    staleTime: 60_000,
  });
  const clients = list.data ?? [];
  const q = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(client ? { client } : {}), ...extra });
    const s = p.toString().replace(/\+/g, '%20');
    return s ? `&${s}` : '';
  };
  return (
    <DashSection title="Statement of account" headIcon={{ icon: FileText, tone: 'blue' }} meta="Opening balance, invoiced, received and closing for a period" className="mb-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSelect aria-label="Statement client" value={client} onChange={(e) => setClient(e.target.value)} options={[{ value: '', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))]} />
        <Button size="sm" asChild>
          <Link href={`/receivables/manager/statement?sheet=${sheetId}${q()}`}>Open statement</Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <a href={`/api/receivables/sheets/${sheetId}/statement?${q({ format: 'xlsx' }).slice(1)}`}>
            <ArrowDownToLine aria-hidden /> Excel
          </a>
        </Button>
      </div>
    </DashSection>
  );
}
