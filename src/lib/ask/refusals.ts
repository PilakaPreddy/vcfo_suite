import type { AnswerEnvelope, AskShell } from '@/data/ask/schema';

/** Fixed copy (ASK-VCFO-CONTEXT §6.8). Never model-written. */
export const REFUSAL_COPY = {
  offTopicClient:
    'I can only help with your company setup and Indian compliance questions. Is there something about your project I can explain?',
  offTopicStaff:
    'I can help with firm projects, deadlines and Indian compliance rules. That question is outside what I cover.',
  decision:
    "This is a decision for your firm. Here's what it means, and your project lead can confirm what applies to your company.",
  decisionStaff:
    'Ask VCFO does not make decisions for the firm. Open the project to decide with the team.',
  unavailable: 'Ask VCFO is unavailable right now. Your project lead can help in the meantime.',
  unavailableStaff: 'Ask VCFO is unavailable right now.',
  uncertain: "I'm not certain about this one. Your project lead can answer it.",
  uncertainStaff: "I'm not certain about this one, because my sources don't cover it. Open the project or the source to check.",
  greetingClient: 'Hello. Ask me anything about your company setup, or pick a question below.',
  greetingStaff: 'Hello. Ask about firm projects, deadlines or compliance rules, or pick a question below.',
  rateLimited: "You've asked a lot of questions in a short time. Please try again a little later.",
  budgetReached: "Ask VCFO has reached today's usage limit, so typed questions resume tomorrow. Suggested questions still work.",
  pathStopped: 'This kind of answer is switched off for now. Suggested questions still work.',
  runTooLong: 'That question needed more work than one answer allows. Try asking about one project or one form at a time.',
  doWork: "I can't do that from chat yet. I can explain it or show you where to do it.",
  doWorkStaff: "I can't do that one from chat yet. Here is what I can do:",
} as const;

function envelope(line: string, shell: AskShell, extra: Partial<AnswerEnvelope> = {}): AnswerEnvelope {
  return {
    line,
    citations: [],
    actions: shell === 'client' ? ['askLead'] : [],
    origin: 'refusal',
    depth: 'normal',
    ...extra,
  };
}

export function offTopicAnswer(shell: AskShell): AnswerEnvelope {
  return envelope(shell === 'client' ? REFUSAL_COPY.offTopicClient : REFUSAL_COPY.offTopicStaff, shell, {
    actions: [],
  });
}

export function unavailableAnswer(shell: AskShell): AnswerEnvelope {
  return envelope(shell === 'client' ? REFUSAL_COPY.unavailable : REFUSAL_COPY.unavailableStaff, shell);
}

export function limitAnswer(shell: AskShell, limit: 'budgetReached' | 'pathStopped' | 'runTooLong' | 'doWork'): AnswerEnvelope {
  return envelope(REFUSAL_COPY[limit], shell);
}

export function greetingAnswer(shell: AskShell): AnswerEnvelope {
  return {
    line: shell === 'client' ? REFUSAL_COPY.greetingClient : REFUSAL_COPY.greetingStaff,
    citations: [],
    actions: [],
    origin: 'deterministic',
    depth: 'normal',
  };
}

/** Safe fallback after validation fails twice (§6.6). Staff are the lead, so they get no "ask your lead". */
export function uncertainAnswer(shell: AskShell): AnswerEnvelope {
  const client = shell === 'client';
  return {
    line: client ? REFUSAL_COPY.uncertain : REFUSAL_COPY.uncertainStaff,
    citations: [],
    actions: client ? ['askLead'] : [],
    origin: 'generated',
    depth: 'normal',
  };
}
