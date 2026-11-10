/**
 * Clear every client and project that was typed in while testing, so the firm can start
 * with its real clients. The app itself, its settings and the staff logins stay.
 *
 *   npm run clients:reset                 # local database: show what would go, change nothing
 *   npm run clients:reset -- --yes        # local database: delete it
 *   npm run clients:reset:prod            # production: show what would go, change nothing
 *   npm run clients:reset:prod -- --yes   # production: take an RDS snapshot, then delete
 *
 * What is DELETED:
 * - Every project (engagement): company names, parent and subsidiary details, directors,
 *   questionnaire answers, the SPICe+ checklist, documents, board resolutions, board
 *   meetings, compliance calendars and filings, tasks, notes, messages, budgets, notices,
 *   expiries, labour registers, credentials and everything else stored per project. All of
 *   these hang off `engagements` with ON DELETE CASCADE, so deleting the project removes them.
 * - Every client login (role `client`) and the demo logins (`@demo.vcfo.local`,
 *   `@demo.sbctrack.in`), with their sessions, preferences and portal state.
 * - Prospects in the pipeline, pending client invites, notifications, the reminder log, the
 *   failed-email outbox, exported files and KPI snapshots, since all of them describe the
 *   test clients.
 * - The project files in S3 (any object whose key names a deleted project or login), except
 *   the knowledge bank.
 *
 * What is KEPT:
 * - Staff logins (super admin, admin, manager, intern, developer, partner) and their
 *   passwords, Outlook links and saved reports.
 * - Firm settings, document and email templates, the compliance obligation and activity
 *   libraries, the agenda library, announcements, the knowledge bank, Ask VCFO sources,
 *   developer settings, the audit log of staff actions, receivables and website demo requests.
 *
 * Without `--yes` the script only counts. With `--yes` the database part runs in one
 * transaction: it either all happens or none of it does.
 */
import './load-env';

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { deleteObject, listObjects } from '../src/storage/s3';

const apply = process.argv.includes('--yes');
const skipStorage = process.argv.includes('--skip-storage');

const DEMO_EMAIL_PATTERN = '%@demo.vcfo.local';
const DEMO_EMAIL_PATTERN_PROD = '%@demo.sbctrack.in';

/**
 * KEEP_ONLY_ADMINS (comma-separated emails) keeps only those logins, as admins, and deletes
 * every other login, staff included. Missing ones are created as admins with no password
 * (they sign in with Microsoft or use Forgot password).
 */
const KEEP_ONLY = (process.env.KEEP_ONLY_ADMINS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Profiles that go: every client login and every demo-tagged login, or all but KEEP_ONLY. */
const DOOMED_PROFILES = KEEP_ONLY.length
  ? sql`select id from profiles where lower(email) not in (${sql.join(KEEP_ONLY.map((e) => sql`${e}`), sql`, `)})`
  : sql`
  select id from profiles
  where role = 'client'
     or lower(email) like ${DEMO_EMAIL_PATTERN}
     or lower(email) like ${DEMO_EMAIL_PATTERN_PROD}`;

/** Tables cleared outright because every row in them is about the test clients. */
const CLEARED_TABLES = [
  'prospects',
  'notifications',
  'compliance_reminder_log',
  'failed_emails',
  'export_files',
  'kpi_snapshots',
] as const;

/** Storage prefixes never touched. */
const PROTECTED_PREFIXES = ['knowledge-bank/'];

type Row = Record<string, unknown>;

async function rows<T extends Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(query);
  return res.rows as T[];
}

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const [row] = await rows<{ n: string }>(query);
  return Number(row?.n ?? 0);
}

async function main() {
  const projects = await rows<{ id: string; slug: string | null; company_name: string }>(
    sql`select id, slug, company_name from engagements order by company_name`,
  );
  const doomedProfiles = await rows<{ id: string; email: string; role: string }>(
    sql`select id, email, role from profiles where id in (${DOOMED_PROFILES}) order by role, email`,
  );
  const keptProfiles = await rows<{ id: string; email: string; role: string }>(
    sql`select id, email, role from profiles where id not in (${DOOMED_PROFILES}) order by role, email`,
  );

  console.log(apply ? 'RESETTING client data.\n' : 'DRY RUN: nothing will change. Add --yes to delete.\n');

  console.log(`Projects to delete (${projects.length}):`);
  for (const p of projects) console.log(`  - ${p.company_name}${p.slug ? ` (${p.slug})` : ''}`);

  console.log(`\nLogins to delete (${doomedProfiles.length}):`);
  for (const p of doomedProfiles) console.log(`  - ${p.role.padEnd(11)} ${p.email}`);

  console.log(`\nStaff logins kept (${keptProfiles.length}):`);
  for (const p of keptProfiles) console.log(`  + ${p.role.padEnd(11)} ${p.email}`);

  console.log('\nOther rows to delete:');
  for (const table of CLEARED_TABLES) {
    console.log(`  ${table.padEnd(26)} ${await count(sql`select count(*) as n from ${sql.identifier(table)}`)}`);
  }
  console.log(
    `  ${'invites (client)'.padEnd(26)} ${await count(
      sql`select count(*) as n from invites where role = 'client' or engagement_id is not null`,
    )}`,
  );
  console.log(
    `  ${'audit_events (projects)'.padEnd(26)} ${await count(
      sql`select count(*) as n from audit_events
          where engagement_id is not null or actor_user_id in (${DOOMED_PROFILES})`,
    )}`,
  );

  if (KEEP_ONLY.length) {
    console.log(`\nKEEP_ONLY_ADMINS: ${KEEP_ONLY.join(', ')} (made admin; missing ones created).`);
    if (apply) {
      for (const email of KEEP_ONLY) {
        await db.execute(sql`insert into profiles (email, role, name) values (${email}, 'admin', ${email.split('@')[0]})
          on conflict (email) do update set role = 'admin', status = 'active'`);
      }
      keptProfiles.splice(0, keptProfiles.length, ...(await rows<{ id: string; email: string; role: string }>(
        sql`select id, email, role from profiles where id not in (${DOOMED_PROFILES})`,
      )));
    } else if (!keptProfiles.length) {
      keptProfiles.push({ id: '', email: KEEP_ONLY[0], role: 'admin' });
    }
  }

  if (keptProfiles.filter((p) => p.role === 'super_admin' || p.role === 'admin').length === 0) {
    throw new Error('No admin or super admin login would be left. Refusing to continue.');
  }

  if (!apply) {
    console.log('\nNothing changed. Run again with --yes to delete the rows above.');
    return;
  }

  const projectIds = new Set(projects.map((p) => p.id));
  const profileIds = new Set(doomedProfiles.map((p) => p.id));
  const exportKeys = (await rows<{ object_key: string }>(sql`select object_key from export_files`)).map(
    (r) => r.object_key,
  );

  // A kept admin takes over rows whose foreign key to profiles is RESTRICT or NO ACTION.
  const heir =
    keptProfiles.find((p) => p.role === 'super_admin') ?? keptProfiles.find((p) => p.role === 'admin')!;

  await db.transaction(async (tx) => {
    // Audit rows about the test projects would otherwise survive with the project id blanked.
    await tx.execute(sql`delete from audit_events where engagement_id is not null`);

    // Projects first: about sixty child tables cascade from here.
    await tx.execute(sql`delete from engagements`);

    for (const table of CLEARED_TABLES) {
      await tx.execute(sql`delete from ${sql.identifier(table)}`);
    }
    await tx.execute(sql`delete from invites where role = 'client' or engagement_id is not null`);

    // Rows that block deleting a profile (RESTRICT / NO ACTION) and are not project rows.
    await tx.execute(sql`update profiles set reports_to_manager_id = null where reports_to_manager_id in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update activity set actor_id = null where actor_id in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update documents set uploaded_by = null where uploaded_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update tasks set assigned_to = null where assigned_to in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update document_requests set requested_by = null where requested_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update document_templates set uploaded_by = ${heir.id} where uploaded_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update email_templates set created_by = ${heir.id} where created_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update email_templates set updated_by = ${heir.id} where updated_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update knowledge_bank_files set uploaded_by = ${heir.id} where uploaded_by in (${DOOMED_PROFILES})`);
    await tx.execute(sql`update knowledge_bank_folders set created_by = ${heir.id} where created_by in (${DOOMED_PROFILES})`);

    await tx.execute(sql`delete from profiles where id in (${DOOMED_PROFILES})`);
  });

  console.log('\nDatabase: done.');
  console.log(`  ${await count(sql`select count(*) as n from engagements`)} projects left`);
  console.log(`  ${await count(sql`select count(*) as n from profiles where role = 'client'`)} client logins left`);

  if (skipStorage) {
    console.log('\nStorage: skipped (--skip-storage).');
    return;
  }

  // Storage last and best effort: a database without the rows is already a fresh tool, and
  // an orphaned file is invisible in the app.
  try {
    const ids = [...projectIds, ...profileIds];
    const objects = await listObjects('', 1_000_000);
    const doomedKeys = new Set(exportKeys);
    for (const o of objects) {
      if (PROTECTED_PREFIXES.some((prefix) => o.key.startsWith(prefix))) continue;
      if (ids.some((id) => o.key.includes(id))) doomedKeys.add(o.key);
    }
    let removed = 0;
    for (const key of doomedKeys) {
      try {
        await deleteObject(key);
        removed += 1;
      } catch (err) {
        console.warn(`  could not delete ${key}: ${(err as Error).message}`);
      }
    }
    console.log(`\nStorage: deleted ${removed} file(s) of ${objects.length} scanned.`);
  } catch (err) {
    console.warn(`\nStorage: not cleaned (${(err as Error).message}). The database reset still stands.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
