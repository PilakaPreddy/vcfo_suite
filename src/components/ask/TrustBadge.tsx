import type { AnswerEnvelope } from '@/data/ask/schema';
import { Chip } from '@/components/ui/spectrum-chip';

/**
 * U1: "Reviewed by {firm}" only for reviewed content and deterministic
 * answers; a draft topic or a model answer never carries it. A line about work
 * in progress, such as a review card, has nothing to vouch for and carries no
 * badge. Drawn as the Spectrum status chip (green reviewed, amber AI answer,
 * grey draft).
 */
export function TrustBadge({ answer, firmName }: { answer: AnswerEnvelope; firmName: string }) {
  if (answer.origin === 'refusal' || answer.origin === 'work') return null;
  if (answer.draft) {
    return (
      <Chip tone="idle" className="w-fit">
        Not yet reviewed · check with your lead
      </Chip>
    );
  }
  if (answer.origin === 'reviewed' || answer.origin === 'deterministic') {
    return (
      <Chip tone="ok" className="w-fit">
        Reviewed by {firmName}
      </Chip>
    );
  }
  return (
    <Chip tone="warn" className="w-fit">
      AI answer · check with your lead
    </Chip>
  );
}
