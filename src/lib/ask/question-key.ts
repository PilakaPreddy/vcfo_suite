/**
 * The exact key a saved answer is stored under. Case, punctuation at word edges and spacing fold
 * together; nothing else does, because "GSTR-1 due date" and "GSTR-3B due date" must never meet.
 */
export function questionKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+\-/\s]/gu, ' ')
    .replace(/(^|\s)[-/]+|[-/]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A question about the asker or about now has an answer that changes, so it is never saved. */
const PERSONAL_OR_LIVE =
  /\b(my|our|ours|mine|we|us|i|me|mera|meri|mere|hamara|hamari|hamare|humara|humari|today|tomorrow|yesterday|now|current|currently|latest|recent|pending|overdue|status|this|that|these|those|aaj|kal|abhi|(next|last) (week|month|quarter|year|fy)|is (mahine|saal|hafte))\b|x{4,}[0-9a-z]{4}/i;

export function isStandingQuestion(text: string): boolean {
  return !PERSONAL_OR_LIVE.test(questionKey(text));
}
