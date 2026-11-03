import { PublicReceivables } from '@/views/receivables/client/PublicReceivables';
import { publicReceivablesMetadata } from '@/views/receivables/client/public-metadata';

export const metadata = publicReceivablesMetadata;
export const dynamic = 'force-dynamic';

/**
 * /receivables — the plain address. It shows a sheet only when its manager turned the key off;
 * otherwise it asks the visitor to use the link SBC sent (docs/specs/receivables/PLAN.md).
 */
export default function ReceivablesPage() {
  return <PublicReceivables publicKey={null} />;
}
