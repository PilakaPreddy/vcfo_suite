import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivablePartners } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { partnerSlug } from '@/lib/receivables/links';
import type { Partner } from '@/lib/receivables/model';
import { UUID, invalid, logChange, notFound, scopedSheet } from './shared';
import { toPartner } from './sheets';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPartner(input: { name?: unknown; email?: unknown }, required: boolean): { name?: string; email?: string } {
  const out: { name?: string; email?: string } = {};
  if (input.name !== undefined || required) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) throw invalid('name');
    out.name = name;
  }
  if (input.email !== undefined || required) {
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!EMAIL.test(email) || email.length > 200) throw invalid('email');
    out.email = email;
  }
  return out;
}

/** Client partners have no login; they are the page filter and the reminder recipients. */
export async function addPartner(ctx: AuthContext, sheetId: string, input: { name: string; email: string }): Promise<Partner> {
  const sheet = await scopedSheet(ctx, sheetId);
  const { name, email } = cleanPartner(input, true);
  const existing = await db.select({ slug: receivablePartners.slug }).from(receivablePartners).where(eq(receivablePartners.sheetId, sheet.id));
  const [row] = await db
    .insert(receivablePartners)
    .values({ sheetId: sheet.id, name: name!, email: email!, slug: partnerSlug(name!, existing.map((e) => e.slug)) })
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `Client partner ${row.name} added`, affectsPage: false });
  return toPartner(row);
}

export async function updatePartner(ctx: AuthContext, partnerId: string, patch: { name?: string; email?: string; active?: boolean }): Promise<Partner> {
  if (!UUID.test(partnerId ?? '')) throw notFound();
  const [p] = await db.select().from(receivablePartners).where(eq(receivablePartners.id, partnerId)).limit(1);
  if (!p) throw notFound();
  const sheet = await scopedSheet(ctx, p.sheetId);
  const set: Partial<typeof receivablePartners.$inferInsert> = cleanPartner(patch, false);
  if (typeof patch.active === 'boolean') set.active = patch.active;
  const [row] = await db
    .update(receivablePartners)
    .set(set)
    .where(and(eq(receivablePartners.id, p.id), eq(receivablePartners.sheetId, sheet.id)))
    .returning();
  // A renamed partner shows under the new name only after the next Update.
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `Client partner ${row.name} updated`, affectsPage: patch.name !== undefined && patch.name !== p.name });
  return toPartner(row);
}
