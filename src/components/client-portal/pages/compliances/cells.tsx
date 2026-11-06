'use client';

/** Table cells shared by the Filings grid and the Obligation history grid (Tailwind island parts). */
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { daysBetween, fmtDM, plural, statusOf, type PortalFiling } from '@/lib/client-portal/compliances';

export function FiledCell({ r, today }: { r: PortalFiling; today: string }) {
  const s = statusOf(r, today);
  const left = daysBetween(today, r.dueDate);
  if (r.filedOn) return <span className={cn('whitespace-nowrap', daysBetween(r.dueDate, r.filedOn) > 0 && 'font-medium text-danger')}>{fmtDM(r.filedOn)}</span>;
  if (s === 'over') return <span className="whitespace-nowrap font-medium text-danger">{plural(-left, 'day')} late</span>;
  return (
    <span className="whitespace-nowrap text-ink-muted" title={left === 0 ? 'Due today' : `Due in ${plural(left, 'day')}`}>
      Not filed yet
    </span>
  );
}

export function ProofCell({ r, onProof, onDownload }: { r: PortalFiling; onProof: (f: PortalFiling) => void; onDownload: (f: PortalFiling) => void }) {
  if (!r.filedOn) return <span className="text-ink-faint">-</span>;
  if (r.proofCount === 0)
    return (
      <span className="whitespace-nowrap text-[12.5px] text-ink-muted" title="SBC will upload the proof">
        Proof pending
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <button
        type="button"
        className="text-[13px] font-medium text-ink-2 hover:text-brand-text hover:underline"
        aria-label={`Open proof · ${r.name} · ${r.period}`}
        onClick={(e) => {
          e.stopPropagation();
          onProof(r);
        }}
      >
        {plural(r.proofCount, 'file')}
      </button>
      <Button
        type="button"
        size="iconSm"
        variant="ghost"
        aria-label={`Download proof for ${r.name} ${r.period}`}
        onClick={(e) => {
          e.stopPropagation();
          onDownload(r);
        }}
      >
        <Download size={16} strokeWidth={1.6} aria-hidden />
      </Button>
    </span>
  );
}
