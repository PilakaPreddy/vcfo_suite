import 'server-only';

import type { AppRole } from '@/auth/guards';
import type { AnswerEnvelope, AskShell } from '@/data/ask/schema';
import { actionsForRole } from '@/lib/actions/registry';
import { agentMayExecute } from '@/lib/actions/types';
import { askFlags } from '@/lib/ask/config';

/**
 * "What can you do?" answered by code, from the action registry, so the list is never wider or
 * narrower than what the chat really runs for this role. The same lines go into the staff persona,
 * so the model does not tell a lead that the chat is read only when it is not.
 */

/** What a staff chat reads and explains. These need no action; they are the read tools and links. */
export const STAFF_READS =
  "I can read your clients' status (overdue, due soon, waiting on the client, waiting for approval), " +
  'your open steps and what is stuck, tasks, document requests, board meetings, labour registers, budgets ' +
  'and vault files, show where each project is in Part A, Part B and post-incorporation, count records, ' +
  "explain Indian company and compliance rules from the firm's sources, and open the right page for you.";

const LEGAL_LIMIT = 'I never submit to MCA, sign with a DSC or make a payment. I can only prepare those for you.';

const CLIENT_LINE =
  'I explain your company setup and compliance in plain English, show where your project is, what is ' +
  "waiting on you and which filings are coming up. I can't change, file or send anything; your project " +
  'lead does that.';

/** The actions this role may start from chat today, as plain lines. Switched-off tiers are left out. */
export async function staffActionLines(role: AppRole): Promise<string[]> {
  const flags = askFlags();
  if (flags.killedPaths.has('fixed_workflow')) return [];
  const actions = await actionsForRole(role);
  return actions
    .filter((a) => a.capability && agentMayExecute(a.tier) && !flags.killedTiers.has(a.tier))
    .map((a) => a.capability!);
}

/** For the staff persona: what the chat reads and what it may change, in plain sentences. */
export async function staffCapabilityText(role: AppRole): Promise<string> {
  const lines = await staffActionLines(role);
  const does =
    lines.length > 0
      ? `You can also start these changes; each one is shown to the person on a review card and saves only when they approve it: ${lines.join('; ')}.`
      : 'You cannot change anything from this chat yet.';
  return `${STAFF_READS} ${does} ${LEGAL_LIMIT}`;
}

export async function capabilityAnswer(role: AppRole, shell: AskShell, intro?: string): Promise<AnswerEnvelope> {
  const base = { citations: [], actions: [], origin: 'deterministic' as const, depth: 'normal' as const };
  if (shell === 'client') return { ...base, line: intro ? `${intro} ${CLIENT_LINE}` : CLIENT_LINE };
  const lines = (await staffActionLines(role)).slice(0, 8);
  const head = intro ?? 'Here is what I can do for you in this chat.';
  if (lines.length === 0) return { ...base, line: `${head} ${STAFF_READS} I can't change anything from chat yet. ${LEGAL_LIMIT}` };
  const does =
    lines.length >= 2
      ? 'I can also make these changes. Nothing saves until you approve the review card.'
      : `I can also ${lines[0]![0]!.toLowerCase()}${lines[0]!.slice(1)}. Nothing saves until you approve the review card.`;
  return {
    ...base,
    line: `${head} ${STAFF_READS} ${does} ${LEGAL_LIMIT}`,
    // A one-item list is not a list; the steps visual needs two.
    ...(lines.length >= 2 ? { visual: { type: 'steps' as const, items: lines.map((label) => ({ label: label.slice(0, 160) })) } } : {}),
  };
}

/** "What can you do", "how can you help", "what are the things you can do from chat". */
const CAPABILITY_QUESTION =
  /\b(?:what (?:all |else )?(?:can|could) (?:you|u) do|what (?:are|r) (?:the |all the )?things (?:that )?(?:you|u) can do|what do (?:you|u) do|how (?:can|could) (?:you|u) help|what can i (?:ask|do) (?:here|in (?:this |the )?chat|with (?:you|u))|(?:your|ur) (?:capabilities|abilities|features)|what are (?:you|u) able to do)\b/;

export function isCapabilityQuestion(message: string): boolean {
  return CAPABILITY_QUESTION.test(message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' '));
}
