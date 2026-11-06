import { createHash } from 'node:crypto';
import { maskIdentityNumbers } from '@/lib/ask/mask';

/**
 * Record cards: a short searchable text per note, comment, request or task. A card holds what people
 * wrote and never live state such as a status or an owner; those come from the tools and metrics, so
 * they cannot go stale here. Regulatory-update cards are written by Watch when it publishes.
 */

export const CARD_KINDS = ['task', 'request', 'note', 'compliance_task', 'comment'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

interface SourceBase {
  id: string;
  engagementId: string;
  companyName: string;
  clientId: string | null;
}

export type CardSource = SourceBase &
  (
    | { kind: 'task' | 'request' | 'note'; title: string | null; body: string | null }
    | { kind: 'compliance_task'; title: string; body: null; visibility: string }
    | { kind: 'comment'; title: string; body: string; internal: boolean; visibility: string }
  );

export interface IndexCard {
  sourceKind: CardKind;
  sourceId: string;
  title: string;
  cardText: string;
  engagementId: string;
  clientId: string | null;
  audience: 'staff' | 'both';
  contentHash: string;
}

/** Identity numbers are left out of a card altogether, not just masked. */
export function stripIdentityNumbers(text: string): string {
  return maskIdentityNumbers(text).replace(/\bX{3,}[0-9A-Z]{4}\b/gi, '[number removed]');
}

const KIND_LABEL: Record<CardKind, string> = {
  task: 'Task',
  request: 'Document request',
  note: 'Staff note',
  compliance_task: 'Compliance task',
  comment: 'Task comment',
};

const clientSees = (visibility: string) => visibility === 'client' || visibility === 'both';

/**
 * Who may read a card. The rule leans staff: a work task and a staff note never reach a client, and
 * a comment reaches one only if the client can already see the task and the comment is not internal.
 */
function audienceOf(source: CardSource): IndexCard['audience'] {
  if (source.kind === 'request') return 'both';
  if (source.kind === 'compliance_task') return clientSees(source.visibility) ? 'both' : 'staff';
  if (source.kind === 'comment') return !source.internal && clientSees(source.visibility) ? 'both' : 'staff';
  return 'staff';
}

export function buildCard(source: CardSource): IndexCard {
  const body = stripIdentityNumbers(source.body?.trim() ?? '');
  const title = stripIdentityNumbers(source.title?.trim() || body.slice(0, 80)).slice(0, 200);
  const cardText = [`${KIND_LABEL[source.kind]} on ${stripIdentityNumbers(source.companyName)}.`, body].filter(Boolean).join(' ').slice(0, 4000);
  return {
    sourceKind: source.kind,
    sourceId: source.id,
    title,
    cardText,
    engagementId: source.engagementId,
    clientId: source.clientId,
    audience: audienceOf(source),
    contentHash: createHash('sha256').update(`${title}\n${cardText}`).digest('hex'),
  };
}
