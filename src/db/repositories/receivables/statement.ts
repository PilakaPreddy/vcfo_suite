import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableInvoices } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { buildStatement, type Statement, type StatementQuery } from '@/lib/receivables/statement';
import { scopedSheet, toInvoice } from './shared';

/**
 * RECEIVABLES STATEMENT OF ACCOUNT, manager side (Phase 10): one client's statement built from the
 * sheet's live invoices (the draft, so a receipt marked today shows before the next Update).
 * Access is `scopedSheet`'s: the sheet's own manager and the firm-wide admins; anyone else reads
 * it as not found. The partner's statement, from their published rows only, is
 * `partnerStatement` in partner-portal.ts.
 */
export async function sheetStatement(ctx: AuthContext, sheetId: string, query: StatementQuery): Promise<{ clientOrgName: string; statement: Statement }> {
  const sheet = await scopedSheet(ctx, sheetId);
  const rows = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheet.id), isNull(receivableInvoices.deletedAt)));
  return { clientOrgName: sheet.clientOrgName, statement: buildStatement(rows.map(toInvoice), query) };
}
