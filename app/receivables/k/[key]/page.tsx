import { PublicReceivables } from '@/views/receivables/client/PublicReceivables';
import { publicReceivablesMetadata } from '@/views/receivables/client/public-metadata';

export const metadata = publicReceivablesMetadata;
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ key: string }> };

/** /receivables/k/<key> — the client page, no login, the latest published version only. */
export default async function ReceivablesKeyPage({ params }: Props) {
  const { key } = await params;
  return <PublicReceivables publicKey={key} />;
}
