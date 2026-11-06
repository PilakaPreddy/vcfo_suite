import 'server-only';

import { and, asc, desc, eq, inArray, isNull, ne, notLike, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { documentRequests, documents, engagements, receivableInvoices, tasks } from '@/db/schema';
import { documentRequestDetails } from '@/db/schema-portal-documents';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { PERSONAL_TODO_STEP_PREFIX } from '@/lib/intern/personal-todos';
import { scopeIds } from '@/db/repositories/compliance-tasks/shared';
import { listMySheets } from '@/db/repositories/receivables/sheets';

/**
 * ASK METRICS — the scoped reads the metric catalog needs that no other repository offers.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Every engagement read goes through `scopeIds(ctx, engagementId)`, the same list the compliance
 * reads use: firm-wide for admins, owned for a manager, assigned for a lead, own for a client, and
 * only that engagement when one is named and the caller may reach it. Tasks and document reviews are
 * staff-only and refuse a client before the first query. Invoices follow the receivable sheet rule:
 * a sheet's manager and the firm-wide admins, nobody else.
 */

const isStaff = (ctx: AuthContext) => isAdminOrManager(ctx.role) || ctx.role === 'intern';

export interface OpenTaskRow {
  title: string;
  deadline: Date | null;
  companyName: string | null;
  slug: string | null;
}

/** Tasks not yet done. A firm-wide admin also counts tasks that belong to no project. */
export async function listOpenTasksForMetrics(ctx: AuthContext, engagementId?: string | null): Promise<OpenTaskRow[]> {
  if (!isStaff(ctx)) return [];
  const firmWide = isFirmWideAdmin(ctx.role) && !engagementId;
  const ids = firmWide ? [] : await scopeIds(ctx, engagementId);
  if (!firmWide && ids.length === 0) return [];
  const notPersonal = or(isNull(tasks.stepId), notLike(tasks.stepId, `${PERSONAL_TODO_STEP_PREFIX}%`));
  return db
    .select({ title: tasks.title, deadline: tasks.deadline, companyName: engagements.companyName, slug: engagements.slug })
    .from(tasks)
    .leftJoin(engagements, eq(engagements.id, tasks.engagementId))
    .where(
      and(
        ne(tasks.status, 'done'),
        notPersonal,
        firmWide ? or(isNull(tasks.engagementId), isNull(engagements.deletedAt)) : inArray(tasks.engagementId, ids),
      ),
    )
    .orderBy(asc(tasks.deadline));
}

export interface OpenRequestRow {
  title: string;
  dueOn: string | null;
  companyName: string;
  slug: string;
}

/** Document requests still pending, oldest due first. */
export async function listOpenRequestsForMetrics(ctx: AuthContext, engagementId?: string | null): Promise<OpenRequestRow[]> {
  const ids = await scopeIds(ctx, engagementId);
  if (ids.length === 0) return [];
  return db
    .select({
      title: documentRequests.title,
      dueOn: documentRequestDetails.dueOn,
      companyName: engagements.companyName,
      slug: engagements.slug,
    })
    .from(documentRequests)
    .innerJoin(engagements, eq(engagements.id, documentRequests.engagementId))
    .leftJoin(documentRequestDetails, eq(documentRequestDetails.requestId, documentRequests.id))
    .where(and(eq(documentRequests.status, 'pending'), inArray(documentRequests.engagementId, ids)))
    .orderBy(asc(documentRequestDetails.dueOn));
}

export interface ReviewDocumentRow {
  fileName: string;
  companyName: string;
  slug: string;
}

/** Current files waiting on a staff review, newest first. */
export async function listDocumentsPendingReview(ctx: AuthContext, engagementId?: string | null): Promise<ReviewDocumentRow[]> {
  if (!isStaff(ctx)) return [];
  const ids = await scopeIds(ctx, engagementId);
  if (ids.length === 0) return [];
  return db
    .select({ fileName: documents.fileName, companyName: engagements.companyName, slug: engagements.slug })
    .from(documents)
    .innerJoin(engagements, eq(engagements.id, documents.engagementId))
    .where(
      and(
        eq(documents.reviewStatus, 'pending'),
        isNull(documents.deletedAt),
        isNull(documents.replacedAt),
        inArray(documents.engagementId, ids),
      ),
    )
    .orderBy(desc(documents.createdAt));
}

export interface OpenInvoiceRow {
  clientName: string;
  invoiceNo: string | null;
  dueDate: string;
  amountInr: string;
  disputed: boolean;
}

/** Open invoices on the sheets this caller may edit, oldest due first. */
export async function listOpenInvoicesForMetrics(ctx: AuthContext): Promise<OpenInvoiceRow[]> {
  if (!isAdminOrManager(ctx.role)) return [];
  const sheets = await listMySheets(ctx);
  if (sheets.length === 0) return [];
  const rows = await db
    .select({
      clientName: receivableInvoices.clientName,
      invoiceNo: receivableInvoices.invoiceNo,
      dueDate: receivableInvoices.dueDate,
      amountInr: receivableInvoices.amountInr,
      disputedAt: receivableInvoices.disputedAt,
      disputeResolvedAt: receivableInvoices.disputeResolvedAt,
    })
    .from(receivableInvoices)
    .where(
      and(
        eq(receivableInvoices.status, 'open'),
        isNull(receivableInvoices.deletedAt),
        inArray(receivableInvoices.sheetId, sheets.map((s) => s.id)),
      ),
    )
    .orderBy(asc(receivableInvoices.dueDate));
  return rows.map(({ disputedAt, disputeResolvedAt, ...row }) => ({
    ...row,
    dueDate: String(row.dueDate),
    disputed: Boolean(disputedAt) && !disputeResolvedAt,
  }));
}
