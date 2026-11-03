/**
 * Demo receivables sheet for local development (docs/specs/receivables/PLAN.md).
 *
 *   npm run db:seed && npm run receivables:seed-demo
 *
 * Creates "Demo Summit Consulting" managed by manager@vcfo.local, with three client partners
 * (two of them with a partner login: priya.partner@vcfo.local and rahul.partner@vcfo.local, both
 * with password partner123), about twenty invoices across four months in INR and USD, a few
 * received ones, a promise to pay and a note, and publishes the first version. It refuses to run
 * when the demo sheet already exists, so it never touches real data.
 */
import './load-env';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { fxRates, profiles, receivableInvoiceNotes, receivableInvoices, receivablePartners, receivableSheets } from '../src/db/schema';
import { systemCreateSheet, publishSheet } from '../src/db/repositories/receivables';
import type { AuthContext } from '../src/auth/guards';
import { todayIst } from '../src/lib/receivables/dates';

const ORG = 'Demo Summit Consulting';

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

async function partnerLogin(email: string, name: string): Promise<string> {
  const [existing] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing) return existing.id;
  const passwordHash = await bcrypt.hash('partner123', 10);
  const [row] = await db.insert(profiles).values({ email, name, role: 'partner', passwordHash, status: 'active' }).returning({ id: profiles.id });
  return row.id;
}

async function main() {
  const [manager] = await db.select().from(profiles).where(eq(profiles.email, 'manager@vcfo.local')).limit(1);
  if (!manager) throw new Error('Run npm run db:seed first: manager@vcfo.local is missing.');
  const [existing] = await db.select({ id: receivableSheets.id }).from(receivableSheets).where(eq(receivableSheets.clientOrgName, ORG)).limit(1);
  if (existing) return console.log(`The demo sheet already exists (${existing.id}). Nothing written.`);

  const today = todayIst();
  const sheet = await systemCreateSheet({ name: ORG, clientOrgName: ORG, managerUserId: manager.id });

  const priyaId = await partnerLogin('priya.partner@vcfo.local', 'Priya Raman');
  const rahulId = await partnerLogin('rahul.partner@vcfo.local', 'Rahul Mehta');
  const now = new Date();
  const [priya, rahul, anita] = await db
    .insert(receivablePartners)
    .values([
      { sheetId: sheet.id, slug: 'priya', name: 'Priya Raman', email: 'priya.partner@vcfo.local', profileId: priyaId, acceptedAt: now, invitedAt: now },
      { sheetId: sheet.id, slug: 'rahul', name: 'Rahul Mehta', email: 'rahul.partner@vcfo.local', profileId: rahulId, acceptedAt: now, invitedAt: now },
      { sheetId: sheet.id, slug: 'anita', name: 'Anita Desai', email: 'anita.partner@vcfo.local' },
    ])
    .returning({ id: receivablePartners.id });

  // Reference rates for the last 30 days, so the FX views have something to show.
  const rates = Array.from({ length: 30 }, (_, i) => ({
    currency: 'USD',
    rateDate: addDays(today, -i),
    rate: (88.4 - i * 0.03 + Math.sin(i / 3) * 0.12).toFixed(4),
    source: 'ecb',
  }));
  await db.insert(fxRates).values(rates).onConflictDoNothing();

  type Seed = { client: string; no: string | null; partner: string; due: number; inr?: number; usd?: number; rate?: number; received?: number; part?: number };
  const seeds: Seed[] = [
    { client: 'Duravant', no: 'SC/08/01', partner: priya.id, due: -74, inr: 1845000 },
    { client: 'Bonterra', no: 'SC/08/02', partner: rahul.id, due: -66, inr: 925000, received: -10 },
    { client: 'Inspired Ed', no: null, partner: anita.id, due: -58, inr: 2310500 },
    { client: 'Northwind', no: 'SC/09/01', partner: priya.id, due: -40, usd: 24000, rate: 87.65 },
    { client: 'Duravant', no: 'SC/09/02', partner: priya.id, due: -33, inr: 1460000 },
    { client: 'Helios Labs', no: 'SC/09/03', partner: rahul.id, due: -28, usd: 15500, rate: 87.9, received: -2 },
    { client: 'Bonterra', no: 'SC/09/04', partner: rahul.id, due: -21, inr: 780000 },
    { client: 'Kestrel', no: 'SC/09/05', partner: anita.id, due: -12, inr: 3125000, part: 1000000 },
    { client: 'Northwind', no: 'SC/10/01', partner: priya.id, due: -6, usd: 18250, rate: 88.1 },
    { client: 'Inspired Ed', no: 'SC/10/02', partner: anita.id, due: -1, inr: 1190000 },
    { client: 'Helios Labs', no: 'SC/10/03', partner: rahul.id, due: 0, usd: 9800, rate: 88.2 },
    { client: 'Duravant', no: 'SC/10/04', partner: priya.id, due: 3, inr: 2045000 },
    { client: 'Kestrel', no: 'SC/10/05', partner: anita.id, due: 5, inr: 640000 },
    { client: 'Bonterra', no: 'SC/10/06', partner: rahul.id, due: 9, inr: 1385000 },
    { client: 'Northwind', no: 'SC/11/01', partner: priya.id, due: 16, usd: 32000, rate: 88.35 },
    { client: 'Orchid Retail', no: 'SC/11/02', partner: rahul.id, due: 22, inr: 2760000 },
    { client: 'Inspired Ed', no: 'SC/11/03', partner: anita.id, due: 28, inr: 990000 },
    { client: 'Helios Labs', no: 'SC/11/04', partner: rahul.id, due: 35, usd: 12400, rate: 88.4 },
  ];

  const rows = await db
    .insert(receivableInvoices)
    .values(
      seeds.map((s) => {
        const dueDate = addDays(today, s.due);
        const invoiceDate = addDays(dueDate, -30);
        const usd = s.usd != null;
        const amount = usd ? Math.round(s.usd! * s.rate! * 100) / 100 : s.inr!;
        const received = s.received != null;
        return {
          sheetId: sheet.id,
          invoiceMonth: monthOf(invoiceDate),
          invoiceDate,
          clientName: s.client,
          invoiceNo: s.no,
          partnerId: s.partner,
          dueDate,
          amountInr: (s.part ? amount - s.part : amount).toFixed(2),
          partPaid: (s.part ?? 0).toFixed(2),
          currency: usd ? 'USD' : 'INR',
          fcAmount: usd ? s.usd!.toFixed(2) : null,
          fxRate: usd ? s.rate!.toFixed(6) : null,
          status: received ? 'received' : 'open',
          paidOn: received ? addDays(today, s.received!) : null,
          paidAmount: received ? (usd ? (s.usd! - 25) * 88.3 : amount).toFixed(2) : null,
          receivedFc: received && usd ? (s.usd! - 25).toFixed(2) : null,
          paidVia: received ? 'manual' : null,
          createdBy: manager.id,
        };
      }),
    )
    .returning({ id: receivableInvoices.id, clientName: receivableInvoices.clientName, dueDate: receivableInvoices.dueDate });

  const promised = rows[0];
  await db
    .update(receivableInvoices)
    .set({ promisedOn: addDays(today, 4), promisedBy: priyaId, promisedAt: now, remindersPausedUntil: addDays(today, 4), pauseReason: `Promised to pay on ${addDays(today, 4)}` })
    .where(eq(receivableInvoices.id, promised.id));
  await db.insert(receivableInvoiceNotes).values([
    { sheetId: sheet.id, invoiceId: promised.id, authorId: priyaId, authorName: 'Priya Raman', fromSbc: false, text: 'Spoke to their CFO; the payment run is on Friday.' },
    { sheetId: sheet.id, invoiceId: promised.id, authorId: manager.id, authorName: manager.name ?? 'SBC', fromSbc: true, text: 'Thanks Priya, reminders are paused until then.' },
  ]);

  const ctx: AuthContext = { userId: manager.id, email: manager.email, name: manager.name ?? 'Manager', role: 'manager' };
  await publishSheet(ctx, sheet.id, 'Demo data');
  console.log(`Demo sheet ${sheet.id}: ${rows.length} invoices, published.`);
  console.log('Manager: manager@vcfo.local / manager123 at /receivables/manager');
  console.log('Partners: priya.partner@vcfo.local and rahul.partner@vcfo.local / partner123 at /receivables/login');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
