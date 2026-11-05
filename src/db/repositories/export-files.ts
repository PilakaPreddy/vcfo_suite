import 'server-only';
import { desc, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { exportFiles } from '@/db/schema-firm';
import type { AuthContext } from '@/auth/guards';
import type { ExportRow } from '@/lib/dev/types';
import { recordAuditEvent } from './audit-events';
import { assertDeveloper, isStaffRole } from './dev-scope';

/**
 * EXPORT FILES — every file the app exported (`export_files`), with a copy in S3 under
 * `exports/` for 30 days (P-373).
 *
 * Writer: `recordExportFileForUser`, called by the export routes for the signed-in person; the
 * row is always that person's own. Readers: developer or super admin list them (a client
 * maker shows as "Client"). Download: the person who made the file, or the super admin; a
 * developer sees the row without the file, because exports hold client data (G-01).
 * Cleanup: `systemPurgeExportFiles`, from the daily cleanup job.
 */

const EXPORT_KEEP_DAYS = 30;

export async function recordExportFileForUser(
  ctx: AuthContext,
  row: { kind: string; format: string; fileName: string; sizeBytes: number; objectKey: string | null },
): Promise<void> {
  await db.insert(exportFiles).values({ ...row, sizeBytes: Math.max(0, Math.round(row.sizeBytes)), madeBy: ctx.userId });
}

export async function listExportFilesForDev(ctx: AuthContext, now = new Date()): Promise<ExportRow[]> {
  assertDeveloper(ctx);
  const rows = await db
    .select({
      id: exportFiles.id,
      kind: exportFiles.kind,
      format: exportFiles.format,
      fileName: exportFiles.fileName,
      sizeBytes: exportFiles.sizeBytes,
      madeBy: exportFiles.madeBy,
      objectKey: exportFiles.objectKey,
      createdAt: exportFiles.createdAt,
      name: profiles.name,
      email: profiles.email,
      role: profiles.role,
    })
    .from(exportFiles)
    .leftJoin(profiles, eq(profiles.id, exportFiles.madeBy))
    .orderBy(desc(exportFiles.createdAt))
    .limit(300);
  const fresh = now.getTime() - EXPORT_KEEP_DAYS * 86400000;
  return rows.map((r) => {
    const staff = isStaffRole(String(r.role ?? ''));
    const kept = Boolean(r.objectKey) && r.createdAt.getTime() > fresh;
    return {
      id: r.id,
      kind: r.kind,
      format: r.format,
      // A client's file name can name the company; only staff file names are shown.
      fileName: staff ? r.fileName : `${r.kind}.${r.format}`,
      sizeBytes: r.sizeBytes,
      madeBy: staff ? r.name?.trim() || r.email?.split('@')[0] || 'Staff' : r.role ? 'Client' : 'Unknown',
      createdAt: r.createdAt.toISOString(),
      kept,
      canDownload: kept && (ctx.role === 'super_admin' || r.madeBy === ctx.userId),
    };
  });
}

/**
 * The S3 key for "Download", or null. Only the maker or the super admin, and only while the
 * copy is kept. Writes `dev.export.download`.
 */
export async function exportKeyForDownloadForDev(ctx: AuthContext, id: string, now = new Date()): Promise<{ key: string; fileName: string } | null> {
  assertDeveloper(ctx);
  const [r] = await db.select().from(exportFiles).where(eq(exportFiles.id, id)).limit(1);
  if (!r || !r.objectKey) return null;
  if (r.createdAt.getTime() <= now.getTime() - EXPORT_KEEP_DAYS * 86400000) return null;
  if (ctx.role !== 'super_admin' && r.madeBy !== ctx.userId) return null;
  await recordAuditEvent(ctx, {
    action: 'dev.export.download',
    summary: `Downloaded the ${r.kind} export from ${r.createdAt.toISOString().slice(0, 10)}`,
    metadata: { exportId: r.id, kind: r.kind, format: r.format },
  });
  return { key: r.objectKey, fileName: r.fileName };
}

/** SYSTEM — the daily cleanup: rows older than 30 days, with their S3 keys to delete. */
export async function systemPurgeExportFiles(now = new Date()): Promise<string[]> {
  const before = new Date(now.getTime() - EXPORT_KEEP_DAYS * 86400000);
  const gone = await db.delete(exportFiles).where(lt(exportFiles.createdAt, before)).returning({ key: exportFiles.objectKey });
  return gone.map((g) => g.key).filter((k): k is string => Boolean(k));
}
