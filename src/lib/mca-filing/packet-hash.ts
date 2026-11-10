import 'server-only';

import { createHash } from 'node:crypto';
import { canonicalJson, type PacketContent } from '@/lib/mca-filing/readiness';

/** SHA-256 of a packet's canonical JSON: the same data always gives the same hash. */
export function packetHash(content: PacketContent): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}
