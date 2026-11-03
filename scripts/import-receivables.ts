/**
 * One-time import of the finance team's receivables workbook into a new receivables sheet
 * (docs/specs/receivables/PLAN.md, open decision 3).
 *
 *   npm run receivables:import -- --file "Receivables Summary Week 1 November.xlsx" \
 *     --manager krishna@sbcllp.in [--org "Summit Consulting"] [--received-on 2026-11-01] \
 *     [--partners partners.csv] [--dry-run]
 *
 * --partners is an optional CSV with a header row `name,email,clients`, where clients is a
 * semicolon-separated list of client names as they appear in the workbook. Invoices of those
 * clients are assigned to that partner; the rest stay unassigned for the manager to set.
 *
 * Summed amount cells become one invoice each. Nothing is published: the manager checks the sheet
 * and clicks Update, and only then does the client page show it. Refuses to run when a sheet for
 * the organisation already exists.
 */
import './load-env';

import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { profiles, receivableChanges, receivableInvoices, receivablePartners, receivableSheets } from '../src/db/schema';
import { systemCreateSheet } from '../src/db/repositories/receivables';
import { parseReceivablesWorkbook } from '../src/lib/receivables/import-workbook';
import { partnerSlug, publicPageUrl } from '../src/lib/receivables/links';
import { todayIst } from '../src/lib/receivables/dates';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function readPartners(path: string): Array<{ name: string; email: string; clients: string[] }> {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const [head, ...rows] = lines;
  if (!/^name\s*,\s*email\s*,\s*clients/i.test(head)) throw new Error('partners CSV needs the header: name,email,clients');
  return rows.map((line) => {
    const [name, email, clients = ''] = line.split(',').map((s) => s.trim());
    return { name, email, clients: clients.split(';').map((c) => c.trim()).filter(Boolean) };
  });
}

async function main() {
  const file = arg('file');
  const managerEmail = arg('manager');
  const org = arg('org') ?? 'Summit Consulting';
  const receivedOn = arg('received-on') ?? todayIst();
  const dryRun = has('dry-run');
  if (!file || !managerEmail) throw new Error('usage: --file <workbook.xlsx> --manager <email> [--org <name>] [--received-on YYYY-MM-DD] [--partners <csv>] [--dry-run]');

  const parsed = await parseReceivablesWorkbook(readFileSync(file), { receivedOn });
  const partners = arg('partners') ? readPartners(arg('partners')!) : [];
  const partnerOfClient = new Map<string, string>();
  for (const p of partners) for (const c of p.clients) partnerOfClient.set(c.toLowerCase(), p.email.toLowerCase());

  console.log(`Worksheet "${parsed.sheetName}": ${parsed.invoices.length} invoices.`);
  for (const i of parsed.invoices) {
    const who = partnerOfClient.get(i.clientName.toLowerCase()) ?? '(no partner)';
    console.log(`  row ${String(i.sourceRow).padStart(3)}  ${i.invoiceMonth.slice(0, 7)}  ${i.clientName.padEnd(18)} due ${i.dueDate}  ₹${i.amountInr.toLocaleString('en-IN').padStart(14)}  ${i.status.padEnd(8)} ${i.part ?? ''}  ${who}`);
  }
  for (const w of parsed.warnings) console.log(`  warning: ${w}`);
  const open = parsed.invoices.filter((i) => i.status === 'open').reduce((a, i) => a + i.amountInr, 0);
  console.log(`Open total: ₹${open.toLocaleString('en-IN')}`);
  if (dryRun) return console.log('Dry run: nothing written.');

  const [manager] = await db.select({ id: profiles.id, role: profiles.role }).from(profiles).where(eq(profiles.email, managerEmail)).limit(1);
  if (!manager) throw new Error(`No profile with email ${managerEmail}.`);
  if (!['manager', 'admin', 'super_admin'].includes(manager.role)) throw new Error(`${managerEmail} is a ${manager.role}; the sheet needs a manager or admin.`);
  const [existing] = await db.select({ id: receivableSheets.id }).from(receivableSheets).where(eq(receivableSheets.clientOrgName, org)).limit(1);
  if (existing) throw new Error(`A receivables sheet for ${org} already exists (${existing.id}). Nothing written.`);

  const sheet = await systemCreateSheet({ name: org, clientOrgName: org, managerUserId: manager.id });
  const slugs: string[] = [];
  const partnerIds = new Map<string, string>();
  for (const p of partners) {
    const slug = partnerSlug(p.name, slugs);
    slugs.push(slug);
    const [row] = await db.insert(receivablePartners).values({ sheetId: sheet.id, name: p.name, email: p.email, slug }).returning({ id: receivablePartners.id });
    partnerIds.set(p.email.toLowerCase(), row.id);
  }
  if (parsed.invoices.length) {
    await db.insert(receivableInvoices).values(
      parsed.invoices.map((i) => ({
        sheetId: sheet.id,
        invoiceMonth: i.invoiceMonth,
        clientName: i.clientName,
        dueDate: i.dueDate,
        amountInr: i.amountInr.toFixed(2),
        status: i.status,
        paidOn: i.paidOn,
        paidAmount: i.status === 'received' ? i.amountInr.toFixed(2) : null,
        paidVia: i.status === 'received' ? 'manual' : null,
        partnerId: partnerIds.get(partnerOfClient.get(i.clientName.toLowerCase()) ?? '') ?? null,
        createdBy: manager.id,
      })),
    );
  }
  await db.insert(receivableChanges).values({ sheetId: sheet.id, invoiceId: null, actorId: manager.id, summary: `${parsed.invoices.length} invoices imported from ${file.split('/').pop()}` });

  const site = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  console.log(`\nSheet ${sheet.id} created for ${org}, manager ${managerEmail}.`);
  console.log(`Not published yet. The manager checks it at ${site}/receivables/manager and clicks Update.`);
  console.log(`Client link after the first Update: ${publicPageUrl(site, sheet)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
