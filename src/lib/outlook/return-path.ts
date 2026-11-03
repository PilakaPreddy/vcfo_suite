/**
 * Where the Outlook connect flow may return besides the role settings page. The receivables
 * manager area (docs/specs/receivables/PLAN.md) lives outside /app, so it asks to come back.
 */
export const OUTLOOK_RETURN_PATHS = new Set(['/receivables/manager']);
