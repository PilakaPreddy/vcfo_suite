/**
 * Named demo clients for a live product walkthrough — one command to put them
 * into a database, one to take them out again.
 *
 *   npm run demo:seed          # local database (.env.local)
 *   npm run demo:clean         # remove everything this script created
 *   npm run demo:seed:prod     # the same, against RDS through the SSM tunnel
 *   npm run demo:clean:prod
 *
 * The six companies, and the state each one is meant to show:
 *
 *   Emburse India            Incorporation — mid SPICe+, one step awaiting review
 *   Emburse WebPT India      Compliance    — incorporation and all registrations done
 *   Emburse Buntera India    Registration  — post-incorporation work in progress
 *   Rootware Labs India      Registration  — SPICe+ and post-incorporation done,
 *                                            registrations and compliances still to come
 *   XYZ Ventures India       Registration  — incorporated by someone else before SBC
 *                                            came on board; registrations are ours
 *   ABC Industries India     Compliance    — incorporation and registrations were done
 *                                            elsewhere; SBC runs the compliance calendar
 *
 * Emburse is one client organisation with three projects (the group entity and
 * its two subsidiaries), so a single client login shows the multi-project
 * portal. Rootware, XYZ and ABC are their own clients.
 *
 * SCOPE AND SAFETY — this is written to be safe to run against production:
 *   - Every row it creates is tagged. Profiles sit on `@demo.sbctrack.in`,
 *     engagements on a `sbcdemo-` slug, document objects under a `sbcdemo/`
 *     storage prefix.
 *   - `--remove` deletes exactly those tagged rows and nothing else. Real
 *     clients, real staff and real documents are never read or written.
 *   - Seeding is idempotent: it clears its own tagged rows first, then rebuilds.
 *   - Compliance filings are generated only for these six engagements. The
 *     firm-wide Inngest generator is deliberately not called.
 *
 * It is database seed data, not UI placeholder data: every screen still reads it
 * live through the repository layer, so the walkthrough runs the real pipeline.
 */
import './load-env';

import bcrypt from 'bcryptjs';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  activity,
  auditEvents,
  clientNeedMeta,
  clientWorkItems,
  complianceInstances,
  complianceObligations,
  documentRequestDetails,
  documentRequests,
  documents,
  engagementClients,
  engagementLeads,
  engagementManagers,
  engagements,
  profiles,
  tasks,
} from '../src/db/schema';
import { getActiveCatalogItems } from '../src/data/checklist';
import { COMPLIANCE_OBLIGATIONS } from '../src/lib/compliance/obligations-seed';
import { generateComplianceInstances } from '../src/lib/compliance/generate-instances';
import type { EntityLegalForm } from '../src/lib/compliance/types';
import type { ChecklistItemStateSlice } from '../src/lib/checklist/checklist-state-key';
import { documentStorageKey, seedPlaceholders } from '../src/storage/demo-placeholders';
import { deleteObject, listObjects } from '../src/storage/s3';

/* ------------------------------------------------------------------ *
 * Tags — the only things cleanup looks for
 * ------------------------------------------------------------------ */

const DEMO_EMAIL_DOMAIN = '@demo.sbctrack.in';
const DEMO_SLUG_PREFIX = 'sbcdemo-';
/** Prefix inside each storage bucket, so placeholder PDFs are also removable. */
const DEMO_STORAGE_PREFIX = 'sbcdemo/';
/** Override with DEMO_PASSWORD when a walkthrough needs a different one. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || 'SbcDemo@2026';

const CATALOG = getActiveCatalogItems();
/** Catalog index of the certificate of incorporation — the end of Phase 2. */
const COI_INDEX = CATALOG.findIndex((item) => item.id === 'pre-12');
/** First index of Phase 3 (post-incorporation) and of Phase 4 (registration). */
const PHASE_3_START = COI_INDEX + 1;
const PHASE_4_START = CATALOG.findIndex((item) => item.id === 'reg-4');

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

/* ------------------------------------------------------------------ *
 * Staff and client logins
 * ------------------------------------------------------------------ */

type PersonSpec = {
  key: string;
  localPart: string;
  name: string;
  role: 'manager' | 'intern' | 'client';
  designation?: string;
  /** profiles.intern_id for a lead, profiles.client_id for a client. */
  scopeId?: string;
};

const MANAGER: PersonSpec = {
  key: 'mgr',
  localPart: 'demo.manager',
  name: 'Rhea Menon',
  role: 'manager',
  designation: 'Project Manager',
};

const LEADS: PersonSpec[] = [
  {
    key: 'lead-aditya',
    localPart: 'demo.lead.aditya',
    name: 'Aditya Shenoy',
    role: 'intern',
    designation: 'Project Lead',
    scopeId: 'sbcdemo-lead-aditya',
  },
  {
    key: 'lead-nikhil',
    localPart: 'demo.lead.nikhil',
    name: 'Nikhil Verma',
    role: 'intern',
    designation: 'Project Lead',
    scopeId: 'sbcdemo-lead-nikhil',
  },
];

/** One client organisation per row; Emburse carries three projects. */
const CLIENT_ORGS: Array<PersonSpec & { orgName: string }> = [
  {
    key: 'client-emburse',
    localPart: 'demo.emburse',
    name: 'Shalini Iyer',
    role: 'client',
    designation: 'Finance Director, Emburse',
    scopeId: 'sbcdemo-org-emburse',
    orgName: 'Emburse Inc.',
  },
  {
    key: 'client-rootware',
    localPart: 'demo.rootware',
    name: 'Karthik Nair',
    role: 'client',
    designation: 'Co-founder, Rootware',
    scopeId: 'sbcdemo-org-rootware',
    orgName: 'Rootware Holdings Pte Ltd',
  },
  {
    key: 'client-xyz',
    localPart: 'demo.xyz',
    name: 'Meera Raghavan',
    role: 'client',
    designation: 'Head of Finance, XYZ',
    scopeId: 'sbcdemo-org-xyz',
    orgName: 'XYZ Ventures Ltd.',
  },
  {
    key: 'client-abc',
    localPart: 'demo.abc',
    name: 'Rohit Deshpande',
    role: 'client',
    designation: 'Director, ABC',
    scopeId: 'sbcdemo-org-abc',
    orgName: 'ABC Industries Ltd.',
  },
];

const ALL_PEOPLE: PersonSpec[] = [MANAGER, ...LEADS, ...CLIENT_ORGS];
const emailFor = (spec: PersonSpec) => `${spec.localPart}${DEMO_EMAIL_DOMAIN}`;

/* ------------------------------------------------------------------ *
 * The six projects
 * ------------------------------------------------------------------ */

/** How the one live step reads on the board. */
type CurrentMode = 'working' | 'review' | 'rejected' | 'overdue' | null;

type ProjectSpec = {
  slug: string;
  companyName: string;
  /** The client-facing organisation name shown on the project header. */
  clientName: string;
  stage: 'Pre-Incorporation' | 'Post-Incorporation' | 'Operational Readiness';
  health: 'on-track' | 'at-risk' | 'overdue';
  companyType: 'domestic' | 'foreign';
  parentEntityName: string;
  parentEntityAddress: string;
  leadKey: string;
  clientKey: string;
  /**
   * Catalog steps below this index were done before SBC was engaged, so they
   * are marked not-applicable with a note. 0 means SBC ran the whole file.
   */
  priorFirmThrough: number;
  /** Catalog steps in [priorFirmThrough, doneThrough) are completed by SBC. */
  doneThrough: number;
  current: CurrentMode;
  startedDaysAgo: number;
  /** Days since the row last changed — the "quiet for N days" read. */
  idleDays: number;
  incorporatedDaysAgo: number | null;
  /** Statutory identifiers, so the overview and SPICe+ screens are not blank. */
  cin: string | null;
  pan: string | null;
  tan: string | null;
  /** Compliance questionnaire answers that drive registration applicability. */
  questionnaire: Record<string, boolean | number | string>;
  employees: number;
  note: string;
};

const PROJECTS: ProjectSpec[] = [
  {
    slug: `${DEMO_SLUG_PREFIX}emburse`,
    companyName: 'Emburse India Pvt Ltd',
    clientName: 'Emburse Inc.',
    stage: 'Pre-Incorporation',
    health: 'on-track',
    companyType: 'foreign',
    parentEntityName: 'Emburse Inc.',
    parentEntityAddress: '1209 Orange Street, Wilmington, DE 19801, USA',
    leadKey: 'lead-aditya',
    clientKey: 'client-emburse',
    priorFirmThrough: 0,
    doneThrough: 9,
    current: 'review',
    startedDaysAgo: 38,
    idleDays: 1,
    incorporatedDaysAgo: null,
    cin: null,
    pan: null,
    tan: null,
    questionnaire: { 'FI-01': true, 'GST-01': true, 'EMP-01': 12, 'TP-01': true },
    employees: 12,
    note: 'SPICe+ Part B in progress — KYC review is with the manager.',
  },
  {
    slug: `${DEMO_SLUG_PREFIX}emburse-webpt`,
    companyName: 'Emburse WebPT India Pvt Ltd',
    clientName: 'Emburse Inc.',
    stage: 'Operational Readiness',
    health: 'on-track',
    companyType: 'foreign',
    parentEntityName: 'Emburse Inc.',
    parentEntityAddress: '1209 Orange Street, Wilmington, DE 19801, USA',
    leadKey: 'lead-aditya',
    clientKey: 'client-emburse',
    priorFirmThrough: 0,
    doneThrough: CATALOG.length,
    current: null,
    startedDaysAgo: 470,
    idleDays: 4,
    incorporatedDaysAgo: 395,
    cin: 'U62099KA2024FTC178431',
    pan: 'AAHCE4512M',
    tan: 'BLRE19427F',
    questionnaire: { 'FI-01': true, 'GST-01': true, 'EMP-01': 64, 'TP-01': true, 'FT-06': true },
    employees: 64,
    note: 'Incorporation and every registration are closed. Only the recurring calendar runs.',
  },
  {
    slug: `${DEMO_SLUG_PREFIX}emburse-buntera`,
    companyName: 'Emburse Buntera India Pvt Ltd',
    clientName: 'Emburse Inc.',
    stage: 'Post-Incorporation',
    health: 'on-track',
    companyType: 'foreign',
    parentEntityName: 'Emburse Inc.',
    parentEntityAddress: '1209 Orange Street, Wilmington, DE 19801, USA',
    leadKey: 'lead-nikhil',
    clientKey: 'client-emburse',
    priorFirmThrough: 0,
    doneThrough: PHASE_3_START + 4,
    current: 'working',
    startedDaysAgo: 168,
    idleDays: 2,
    incorporatedDaysAgo: 61,
    cin: 'U62013KA2026FTC201884',
    pan: 'AAJCB7731Q',
    tan: 'BLRB24118D',
    questionnaire: { 'FI-01': true, 'GST-01': true, 'EMP-01': 9, 'TP-01': true },
    employees: 9,
    note: 'Post-incorporation phase: bank account and share capital infusion are the live work.',
  },
  {
    slug: `${DEMO_SLUG_PREFIX}rootware`,
    companyName: 'Rootware Labs India Pvt Ltd',
    clientName: 'Rootware Holdings Pte Ltd',
    stage: 'Post-Incorporation',
    health: 'at-risk',
    companyType: 'foreign',
    parentEntityName: 'Rootware Holdings Pte Ltd',
    parentEntityAddress: '10 Anson Road, International Plaza, Singapore 079903',
    leadKey: 'lead-nikhil',
    clientKey: 'client-rootware',
    priorFirmThrough: 0,
    doneThrough: PHASE_4_START,
    current: 'working',
    startedDaysAgo: 205,
    idleDays: 11,
    incorporatedDaysAgo: 96,
    cin: 'U72900KA2026FTC199507',
    pan: 'AAGCR5290H',
    tan: 'BLRR31806B',
    questionnaire: { 'FI-01': true, 'GST-01': true, 'EMP-01': 18, 'TP-01': true, 'FT-06': true },
    employees: 18,
    note: 'SPICe+ Part A and B and the post-incorporation phase are closed. Registrations start now.',
  },
  {
    slug: `${DEMO_SLUG_PREFIX}xyz`,
    companyName: 'XYZ Ventures India Pvt Ltd',
    clientName: 'XYZ Ventures Ltd.',
    stage: 'Post-Incorporation',
    health: 'on-track',
    companyType: 'foreign',
    parentEntityName: 'XYZ Ventures Ltd.',
    parentEntityAddress: '20 Fenchurch Street, London EC3M 3BY, United Kingdom',
    leadKey: 'lead-aditya',
    clientKey: 'client-xyz',
    // Already incorporated when it became a client, so Phase 1 and Phase 2 were
    // somebody else's work. The certificate step still carries the identifiers.
    priorFirmThrough: PHASE_3_START,
    doneThrough: PHASE_4_START + 11,
    current: 'working',
    startedDaysAgo: 84,
    idleDays: 3,
    incorporatedDaysAgo: 310,
    cin: 'U70200KA2025FTC186642',
    pan: 'AADCX8806L',
    tan: 'BLRX27553C',
    questionnaire: { 'FI-01': true, 'GST-01': true, 'EMP-01': 31, 'TP-01': true },
    employees: 31,
    note: 'Incorporated before SBC was engaged. SBC picked the file up at the registration phase.',
  },
  {
    slug: `${DEMO_SLUG_PREFIX}abc`,
    companyName: 'ABC Industries India Pvt Ltd',
    clientName: 'ABC Industries Ltd.',
    stage: 'Operational Readiness',
    health: 'at-risk',
    companyType: 'domestic',
    parentEntityName: 'ABC Industries Ltd.',
    parentEntityAddress: '7th Floor, Nirmal Building, Nariman Point, Mumbai 400021',
    leadKey: 'lead-nikhil',
    clientKey: 'client-abc',
    // Incorporation and every registration were done by the previous consultant.
    priorFirmThrough: CATALOG.length,
    doneThrough: CATALOG.length,
    current: null,
    startedDaysAgo: 52,
    idleDays: 6,
    incorporatedDaysAgo: 880,
    cin: 'U28100MH2023PTC401276',
    pan: 'AABCA1174J',
    tan: 'MUMA40882E',
    questionnaire: { 'FI-01': false, 'GST-01': true, 'EMP-01': 47, 'TP-01': false },
    employees: 47,
    note: 'Came to SBC only for the compliance calendar. Incorporation and registrations were done elsewhere.',
  },
];

/* ------------------------------------------------------------------ *
 * Checklist state
 * ------------------------------------------------------------------ */

const PRIOR_FIRM_NOTE =
  'Completed before SBC was engaged — handled by the client’s previous consultant.';

/**
 * Build the `checklist_state` jsonb for one project.
 *
 * Steps below `priorFirmThrough` are not-applicable with a note, which is how
 * the product already represents a step nobody here has to do (the same shape
 * `createEngagementWithClient` writes for a standalone company's board
 * resolution steps), and the sequential gate flows straight past them. Steps up
 * to `doneThrough` are completed, and the step at `doneThrough` is the live one.
 */
function buildChecklistState(spec: ProjectSpec): Record<string, ChecklistItemStateSlice> {
  const state: Record<string, ChecklistItemStateSlice> = {};
  const span = Math.max(1, spec.startedDaysAgo - 3);
  const stepsBySbc = Math.max(1, spec.doneThrough - spec.priorFirmThrough);

  for (let i = 0; i < Math.min(spec.doneThrough, CATALOG.length); i += 1) {
    const item = CATALOG[i]!;
    if (i < spec.priorFirmThrough && i !== COI_INDEX) {
      state[item.id] = { status: 'not-applicable', notes: PRIOR_FIRM_NOTE };
      continue;
    }
    const done = i - spec.priorFirmThrough;
    const completedOn = ymd(
      daysAgo(Math.max(1, spec.startedDaysAgo - Math.floor((span * done) / stepsBySbc))),
    );
    state[item.id] = {
      status: 'completed',
      completedOn,
      notes: i === COI_INDEX && spec.priorFirmThrough > 0 ? PRIOR_FIRM_NOTE : undefined,
    };
  }

  const live = CATALOG[spec.doneThrough];
  if (live && spec.current) {
    if (spec.current === 'review') {
      state[live.id] = {
        status: 'in-progress',
        reviewStatus: 'reviewing',
        reviewSource:
          live.responsibleRole === 'client' ? 'client_submission' : 'lead_manager_request',
        locked: true,
        clientSubmittedAt: daysAgo(3).toISOString(),
      };
    } else if (spec.current === 'rejected') {
      state[live.id] = {
        status: 'in-progress',
        reviewStatus: 'rejected',
        locked: true,
        clientSubmittedAt: daysAgo(8).toISOString(),
        rejectionNote: 'Please send a utility bill dated within the last two months.',
      };
    } else if (spec.current === 'overdue') {
      state[live.id] = { status: 'overdue' };
    } else {
      state[live.id] = { status: 'in-progress' };
    }
  }

  // Answers the surfaces actually read: the statutory identifiers and the
  // deliverable file fields the client's Documents tiles look for. Only written
  // on steps the project has actually reached.
  const fill = (stepId: string, responses: Record<string, string>) => {
    const index = CATALOG.findIndex((item) => item.id === stepId);
    if (index < 0 || index >= spec.doneThrough) return;
    const existing = state[stepId];
    if (!existing) return;
    state[stepId] = {
      ...existing,
      responses: { ...(existing.responses ?? {}), ...responses },
      deliveredToClientAt: daysAgo(Math.max(1, spec.startedDaysAgo - index * 2)).toISOString(),
    };
  };

  if (spec.cin && spec.pan && spec.tan) {
    fill('pre-12', {
      cin: spec.cin,
      pan: spec.pan,
      tan: spec.tan,
      dateOfIncorporation: spec.incorporatedDaysAgo ? ymd(daysAgo(spec.incorporatedDaysAgo)) : '',
      certificateOfIncorporationFinalUrl: `${DEMO_STORAGE_PREFIX}${spec.slug}/certificate-of-incorporation.pdf`,
      panCardFinalUrl: `${DEMO_STORAGE_PREFIX}${spec.slug}/pan-card.pdf`,
      tanCardFinalUrl: `${DEMO_STORAGE_PREFIX}${spec.slug}/tan-card.pdf`,
    });
  }
  fill('pre-13', {
    authorisedShareCapital: String(1_000_000 + spec.employees * 50_000),
    paidUpShareCapital: String(500_000 + spec.employees * 25_000),
    nominalValuePerEquityShare: '10',
  });
  fill('reg-4', {
    gstCertificateUrl: `${DEMO_STORAGE_PREFIX}${spec.slug}/gst-certificate.pdf`,
    gstRegistrationDate: spec.incorporatedDaysAgo
      ? ymd(daysAgo(Math.max(10, spec.incorporatedDaysAgo - 40)))
      : '',
  });
  fill('reg-8', {
    iecCertificateUrl: `${DEMO_STORAGE_PREFIX}${spec.slug}/iec-certificate.pdf`,
  });

  return state;
}

/* ------------------------------------------------------------------ *
 * Documents, activity, tasks, client-portal items
 * ------------------------------------------------------------------ */

const DOCUMENT_SPECS: Array<{
  fileName: string;
  category: string;
  stepId: string;
  shared: boolean;
}> = [
  { fileName: 'Board resolution — signed.pdf', category: 'deliverables', stepId: 'pre-3', shared: true },
  { fileName: 'Name approval letter (RUN).pdf', category: 'deliverables', stepId: 'pre-5', shared: true },
  { fileName: 'Director KYC pack.pdf', category: 'documents', stepId: 'pre-7', shared: false },
  { fileName: 'SPICe+ Part B acknowledgement.pdf', category: 'documents', stepId: 'pre-10', shared: false },
  { fileName: 'Certificate of Incorporation.pdf', category: 'deliverables', stepId: 'pre-12', shared: true },
  { fileName: 'First board meeting minutes.pdf', category: 'deliverables', stepId: 'post-1', shared: true },
  { fileName: 'Bank account opening kit.pdf', category: 'documents', stepId: 'post-3', shared: false },
  { fileName: 'INC-20A commencement filing.pdf', category: 'deliverables', stepId: 'post-6', shared: true },
  { fileName: 'GST registration certificate.pdf', category: 'deliverables', stepId: 'reg-4', shared: true },
  { fileName: 'PF registration certificate.pdf', category: 'deliverables', stepId: 'reg-1', shared: true },
  { fileName: 'Professional tax enrolment.pdf', category: 'deliverables', stepId: 'reg-7', shared: true },
];

const AUDIT_SPECS: Array<{
  action: string;
  summary: (company: string) => string;
  actor: 'lead' | 'manager' | 'client';
}> = [
  { action: 'engagement.create', summary: (c) => `Created project ${c}`, actor: 'manager' },
  { action: 'engagement.checklist.submit', summary: () => 'Submitted Client Details for review', actor: 'client' },
  { action: 'engagement.checklist.review', summary: () => 'Approved Client Details', actor: 'manager' },
  { action: 'document.upload', summary: () => 'Uploaded the signed board resolution', actor: 'lead' },
  { action: 'engagement.checklist.complete', summary: () => 'Marked Name Application complete', actor: 'lead' },
  { action: 'notify.email', summary: (c) => `Sent the weekly progress update for ${c}`, actor: 'lead' },
  { action: 'engagement.checklist.deliver', summary: () => 'Delivered the Certificate of Incorporation to the client', actor: 'lead' },
  { action: 'document.upload', summary: () => 'Uploaded the GST registration certificate', actor: 'lead' },
  { action: 'compliance.filed', summary: () => 'Marked GSTR-3B filed for the period', actor: 'lead' },
];

const ACTIVITY_SPECS: Array<{ kind: string; message: string }> = [
  { kind: 'step', message: 'submitted the registered office address for review' },
  { kind: 'document', message: 'uploaded the signed board resolution' },
  { kind: 'step', message: 'approved the director KYC pack' },
  { kind: 'compliance', message: 'marked the monthly GST return filed' },
  { kind: 'document', message: 'shared the certificate of incorporation with the client' },
];

const TASK_SPECS: Array<{
  title: string;
  description: string;
  status: string;
  dueInDays: number;
}> = [
  { title: 'Chase the DSC for the second director', description: 'The vendor promised 48 hours — follow up if nothing lands.', status: 'open', dueInDays: 2 },
  { title: 'Draft the MOA object clause', description: 'Use the standard SaaS object clause and adapt the ancillary objects.', status: 'in-progress', dueInDays: 5 },
  { title: 'Book the bank account opening call', description: 'The client prefers Thursday mornings.', status: 'open', dueInDays: 6 },
  { title: 'Collect the rent agreement for PT enrolment', description: 'Needed before the professional tax application can go in.', status: 'open', dueInDays: 4 },
  { title: 'Reconcile the GST input credit for the quarter', description: 'Two invoices are still missing from the portal.', status: 'in-progress', dueInDays: 9 },
];

const WORK_ITEM_SPECS: Array<{ stepId: string; title: string }> = [
  { stepId: 'pre-10', title: 'Preparing the SPICe+ Part B filing' },
  { stepId: 'post-3', title: 'Coordinating the bank account opening' },
  { stepId: 'reg-4', title: 'Filing the GST registration application' },
];

const REQUEST_SPECS: Array<{
  title: string;
  detail: string;
  stepId: string;
  kind: string;
}> = [
  {
    title: 'Latest electricity bill for the registered office',
    detail: 'Dated within the last two months, in the landlord’s name.',
    stepId: 'pre-14',
    kind: 'upload',
  },
  {
    title: 'Director PAN and Aadhaar, self-attested',
    detail: 'One PDF per director is fine.',
    stepId: 'pre-7',
    kind: 'upload',
  },
  {
    title: 'Confirm the authorised signatory for GST',
    detail: 'We need one director named on the GST application.',
    stepId: 'reg-4',
    kind: 'fill',
  },
];

/* ------------------------------------------------------------------ *
 * Cleanup
 * ------------------------------------------------------------------ */

async function removeDemoStorage(): Promise<{ deleted: number; failed: string | null }> {
  let deleted = 0;
  try {
    for (const bucket of ['engagement-documents', 'milestone-documents']) {
      const keys = await listObjects(`${bucket}/${DEMO_STORAGE_PREFIX}`);
      for (const object of keys) {
        await deleteObject(object.key);
        deleted += 1;
      }
    }
  } catch (err) {
    return { deleted, failed: err instanceof Error ? err.message : String(err) };
  }
  return { deleted, failed: null };
}

/**
 * Delete every tagged row. Most tables cascade from `engagements`, so the
 * explicit deletes here are the ones that do not: audit events (which are
 * `on delete set null`) and the demo profiles themselves.
 */
async function removeDemoRows(): Promise<void> {
  const rows = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(like(engagements.slug, `${DEMO_SLUG_PREFIX}%`));

  if (rows.length > 0) {
    const ids = rows.map((row) => row.id);
    await db.delete(auditEvents).where(inArray(auditEvents.engagementId, ids));
    await db.delete(engagements).where(inArray(engagements.id, ids));
    console.log(`  removed ${ids.length} project(s)`);
  } else {
    console.log('  no demo projects found');
  }

  const people = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(like(profiles.email, `%${DEMO_EMAIL_DOMAIN}`));

  if (people.length > 0) {
    const ids = people.map((row) => row.id);
    // Rows that reference a profile without cascading, cleared before the delete.
    await db.delete(auditEvents).where(inArray(auditEvents.actorUserId, ids));
    await db.delete(activity).where(inArray(activity.actorId, ids));
    await db.delete(documents).where(inArray(documents.uploadedBy, ids));
    await db.delete(documentRequests).where(inArray(documentRequests.requestedBy, ids));
    await db.delete(tasks).where(inArray(tasks.assignedTo, ids));
    await db
      .update(profiles)
      .set({ reportsToManagerId: null })
      .where(inArray(profiles.reportsToManagerId, ids));
    await db.delete(profiles).where(inArray(profiles.id, ids));
    console.log(`  removed ${ids.length} account(s)`);
  } else {
    console.log('  no demo accounts found');
  }

  const storage = await removeDemoStorage();
  if (storage.failed) console.warn(`  storage not reachable, files left in place: ${storage.failed}`);
  else console.log(`  removed ${storage.deleted} placeholder file(s) from storage`);
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

async function createPerson(spec: PersonSpec, passwordHash: string): Promise<string> {
  const [row] = await db
    .insert(profiles)
    .values({
      email: emailFor(spec),
      passwordHash,
      name: spec.name,
      role: spec.role,
      designation: spec.designation ?? null,
      internId: spec.role === 'intern' ? spec.scopeId : null,
      clientId: spec.role === 'client' ? spec.scopeId : null,
      status: 'active',
    })
    .returning({ id: profiles.id });
  return row!.id;
}

async function seed(): Promise<void> {
  console.log('Seeding the demo clients (tagged rows only — real data is untouched)…\n');

  console.log('Clearing any previous demo rows…');
  await removeDemoRows();

  console.log('\nCreating accounts…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const ids = new Map<string, string>();
  for (const spec of ALL_PEOPLE) {
    ids.set(spec.key, await createPerson(spec, passwordHash));
  }
  for (const lead of LEADS) {
    await db
      .update(profiles)
      .set({ reportsToManagerId: ids.get(MANAGER.key)!, updatedAt: new Date() })
      .where(eq(profiles.id, ids.get(lead.key)!));
  }
  console.log(`  1 manager, ${LEADS.length} leads, ${CLIENT_ORGS.length} client contacts`);

  console.log('\nCreating projects…');
  const leadScope = new Map(LEADS.map((spec) => [spec.key, spec.scopeId!]));
  const clientScope = new Map(CLIENT_ORGS.map((spec) => [spec.key, spec.scopeId!]));
  const managerId = ids.get(MANAGER.key)!;
  const created: Array<{ id: string; spec: ProjectSpec }> = [];

  for (const spec of PROJECTS) {
    const clientUserId = ids.get(spec.clientKey)!;
    const internId = leadScope.get(spec.leadKey)!;
    const incorporationDate = spec.incorporatedDaysAgo
      ? ymd(daysAgo(spec.incorporatedDaysAgo))
      : null;
    // Registration and Compliance starts need the India entity's legal details
    // (`stageRequiresSubsidiary`), so fill them for anything past incorporation.
    const needsSubsidiary = spec.stage !== 'Pre-Incorporation';

    const [row] = await db
      .insert(engagements)
      .values({
        slug: spec.slug,
        companyName: spec.companyName,
        companyType: spec.companyType,
        ownershipType: 'subsidiary',
        parentIndianRelationship: spec.companyType === 'domestic' ? 'investing' : null,
        entityLegalForm: 'company',
        incorporationDate,
        parentEntityName: spec.parentEntityName,
        parentEntityAddress: spec.parentEntityAddress,
        subsidiaryLegalName: needsSubsidiary ? spec.companyName : null,
        subsidiaryRegisteredAddress: needsSubsidiary
          ? 'WeWork Prestige Central, 36 Infantry Road, Bengaluru 560001'
          : null,
        clientId: clientScope.get(spec.clientKey)!,
        clientUserId,
        clientName: spec.clientName,
        internId,
        managerId,
        stage: spec.stage,
        health: spec.health,
        checklistState: buildChecklistState(spec),
        complianceQuestionnaire: spec.questionnaire,
        expectedCoiOn: spec.incorporatedDaysAgo ? null : ymd(daysAhead(21)),
        createdAt: daysAgo(spec.startedDaysAgo),
        updatedAt: daysAgo(spec.idleDays),
      })
      .returning({ id: engagements.id });

    const engagementId = row!.id;
    created.push({ id: engagementId, spec });

    await db.insert(engagementManagers).values({ engagementId, managerId }).onConflictDoNothing();
    await db.insert(engagementLeads).values({ engagementId, internId }).onConflictDoNothing();
    await db
      .insert(engagementClients)
      .values({ engagementId, userId: clientUserId, memberRole: 'owner' })
      .onConflictDoNothing();

    const sbcSteps = Math.max(0, spec.doneThrough - spec.priorFirmThrough);
    console.log(
      `  ${spec.companyName} — ${spec.stage}, ${sbcSteps}/${CATALOG.length} steps done by SBC` +
        (spec.priorFirmThrough > 0 ? `, ${spec.priorFirmThrough} done elsewhere` : ''),
    );
  }

  /* ---- Documents ---- */
  console.log('\nCreating documents…');
  let documentCount = 0;
  const placeholders: Array<{ key: string; title: string }> = [];
  for (const { id, spec } of created) {
    const uploadedBy = ids.get(spec.leadKey)!;
    const reached = DOCUMENT_SPECS.filter((doc) => {
      const index = CATALOG.findIndex((item) => item.id === doc.stepId);
      // A step the previous consultant handled produces no document in our vault,
      // except the certificate of incorporation, which the client hands over.
      if (index < 0 || index >= spec.doneThrough) return false;
      return index >= spec.priorFirmThrough || doc.stepId === 'pre-12';
    });
    for (const [i, doc] of reached.entries()) {
      const objectKey = `${DEMO_STORAGE_PREFIX}${spec.slug}/${doc.stepId}-${doc.fileName
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase()}`;
      placeholders.push({
        key: documentStorageKey(objectKey),
        title: `${spec.companyName}: ${doc.fileName}`,
      });
      await db.insert(documents).values({
        engagementId: id,
        category: doc.category,
        fileName: doc.fileName,
        objectKey,
        contentType: 'application/pdf',
        sizeBytes: 164_000 + i * 38_000,
        uploadedBy,
        stepId: doc.stepId,
        sharedWithClient: doc.shared,
        reviewStatus: doc.shared ? 'approved' : 'none',
        createdAt: daysAgo(Math.max(1, spec.startedDaysAgo - i * 7)),
      });
      documentCount += 1;
    }
  }
  console.log(`  ${documentCount} document row(s)`);
  // Each row needs a file behind it, or the Documents pages ask for a missing object.
  const stored = await seedPlaceholders(placeholders);
  console.log(`  ${stored.uploaded} placeholder file(s) uploaded, ${stored.existing} already there`);
  if (stored.failed) console.warn(`  storage not reachable, placeholders skipped: ${stored.failed}`);

  /* ---- Audit trail and the client-visible activity feed ---- */
  console.log('\nCreating the activity trail…');
  let auditCount = 0;
  let activityCount = 0;
  for (const { id, spec } of created) {
    const actorFor = (kind: 'lead' | 'manager' | 'client') => {
      if (kind === 'client') return { key: spec.clientKey, role: 'client' as const };
      if (kind === 'manager') return { key: MANAGER.key, role: 'manager' as const };
      return { key: spec.leadKey, role: 'intern' as const };
    };
    const sbcSteps = Math.max(1, spec.doneThrough - spec.priorFirmThrough);
    const entries = AUDIT_SPECS.slice(
      0,
      Math.max(3, Math.min(AUDIT_SPECS.length, Math.ceil(sbcSteps / 4) + 3)),
    );

    for (const [i, entry] of entries.entries()) {
      const actor = actorFor(entry.actor);
      const person = ALL_PEOPLE.find((p) => p.key === actor.key)!;
      await db.insert(auditEvents).values({
        actorUserId: ids.get(actor.key)!,
        actorRole: actor.role,
        actorEmail: emailFor(person),
        actorName: person.name,
        engagementId: id,
        action: entry.action,
        summary: entry.summary(spec.companyName),
        metadata: {},
        createdAt: daysAgo(Math.max(0, spec.idleDays + (entries.length - i - 1) * 4)),
      });
      auditCount += 1;
    }

    for (const [i, entry] of ACTIVITY_SPECS.entries()) {
      await db.insert(activity).values({
        engagementId: id,
        actorId: ids.get(i % 3 === 0 ? spec.clientKey : spec.leadKey)!,
        kind: entry.kind,
        message: entry.message,
        createdAt: daysAgo(Math.max(0, spec.idleDays + (ACTIVITY_SPECS.length - i) * 3)),
      });
      activityCount += 1;
    }
  }
  console.log(`  ${auditCount} audit event(s), ${activityCount} activity entr(ies)`);

  /* ---- Tasks ---- */
  console.log('\nCreating tasks…');
  let taskCount = 0;
  for (const [i, { id, spec }] of created.entries()) {
    const howMany = spec.doneThrough >= CATALOG.length ? 1 : 2;
    for (let t = 0; t < howMany; t += 1) {
      const task = pick(TASK_SPECS, i * 2 + t);
      await db.insert(tasks).values({
        engagementId: id,
        assignedTo: ids.get(spec.leadKey)!,
        assignedBy: managerId,
        title: task.title,
        description: task.description,
        status: task.status,
        deadline: daysAhead(task.dueInDays),
        createdAt: daysAgo(spec.idleDays + 4),
      });
      taskCount += 1;
    }
  }
  console.log(`  ${taskCount} task(s)`);

  /* ---- Client portal: "what SBC is doing" and open requests ---- */
  console.log('\nFilling the client portal…');
  let workItemCount = 0;
  let requestCount = 0;
  for (const [i, { id, spec }] of created.entries()) {
    if (spec.doneThrough < CATALOG.length) {
      for (const [w, item] of WORK_ITEM_SPECS.entries()) {
        const status = w === 0 ? 'done' : 'active';
        await db.insert(clientWorkItems).values({
          engagementId: id,
          stepId: item.stepId,
          title: item.title,
          assigneeId: ids.get(spec.leadKey)!,
          progressPct: status === 'done' ? 100 : 25 + ((i * 19 + w * 23) % 60),
          readyOn: ymd(daysAhead(3 + w * 5 + (i % 3))),
          status,
          createdBy: managerId,
          createdAt: daysAgo(12 - w),
        });
        workItemCount += 1;
      }
    }

    for (const [r, request] of REQUEST_SPECS.entries()) {
      // One pending, one fulfilled, so both sides of the Documents page show.
      const status = r === 0 ? 'pending' : 'fulfilled';
      const createdAt = daysAgo(spec.idleDays + 5 + r * 3);
      const [row] = await db
        .insert(documentRequests)
        .values({
          engagementId: id,
          requestedBy: ids.get(spec.leadKey)!,
          title: request.title,
          detail: request.detail,
          status,
          closedAt: status === 'pending' ? null : daysAgo(spec.idleDays + 1),
          createdAt,
        })
        .returning({ id: documentRequests.id });
      const dueOn = ymd(status === 'pending' ? daysAhead(3 + r) : daysAgo(2));
      await db.insert(clientNeedMeta).values({
        requestId: row!.id,
        engagementId: id,
        stepId: request.stepId,
        kind: request.kind,
        dueDate: dueOn,
      });
      await db.insert(documentRequestDetails).values({
        requestId: row!.id,
        engagementId: id,
        dueOn,
        stepId: request.stepId,
        reviewNote: status === 'fulfilled' ? 'Received, thank you.' : null,
        reviewNoteBy: status === 'fulfilled' ? ids.get(spec.leadKey)! : null,
      });
      requestCount += 1;
    }
  }
  console.log(`  ${workItemCount} work item(s), ${requestCount} document request(s)`);

  /* ---- Compliance filings ---- */
  // The same pure generator the Inngest job uses, but expanded only for these
  // six engagements, so a run never touches another client's calendar.
  console.log('\nGenerating compliance filings…');
  await db
    .insert(complianceObligations)
    .values(
      COMPLIANCE_OBLIGATIONS.map((o) => ({
        id: o.id,
        complianceArea: o.complianceArea,
        particular: o.particular,
        authority: o.authority,
        frequency: o.frequency,
        triggerType: o.triggerType,
        dueRule: o.dueRule,
        appliesTo: o.appliesTo,
        applicabilityNote: o.applicabilityNote ?? null,
        isConditional: o.isConditional ?? false,
        penaltyRisk: o.penaltyRisk,
      })),
    )
    .onConflictDoNothing();

  const today = ymd(new Date());
  let filingCount = 0;
  let filedCount = 0;
  let overdueCount = 0;
  for (const { id, spec } of created) {
    if (!spec.incorporatedDaysAgo) continue;
    const incorporationDate = ymd(daysAgo(spec.incorporatedDaysAgo));
    const gstDate = ymd(daysAgo(Math.max(10, spec.incorporatedDaysAgo - 40)));
    const instances = generateComplianceInstances({
      engagementId: id,
      entityLegalForm: 'company' as EntityLegalForm,
      triggers: {
        incorporationDate,
        gstRegistrationDate: spec.doneThrough > PHASE_4_START ? gstDate : null,
        tanRegistrationDate: incorporationDate,
        pfRegistrationDate: spec.doneThrough > PHASE_4_START + 1 ? gstDate : null,
        esiRegistrationDate: null,
        ptRegistrationDate: null,
        tdsLiabilityStartDate: incorporationDate,
        agmDate: null,
      },
      ownerId: ids.get(spec.leadKey)!,
    });

    for (const [i, instance] of instances.entries()) {
      // Give the runway some history: most past filings are done, every third
      // one has slipped, so all the compliance buckets have something in them.
      const past = instance.dueDate < today;
      const slipped = past && i % 3 === 0;
      await db
        .insert(complianceInstances)
        .values({
          engagementId: id,
          obligationId: instance.obligationId,
          dueDate: instance.dueDate,
          periodStart: instance.periodStart ?? null,
          periodEnd: instance.periodEnd ?? null,
          periodLabel: instance.periodLabel ?? '',
          fyLabel: instance.fyLabel ?? null,
          status: past ? (slipped ? 'overdue' : 'filed') : instance.status,
          ownerId: ids.get(spec.leadKey)!,
          filedOn: past && !slipped ? instance.dueDate : null,
          filedNote: past && !slipped ? 'Filed on the portal.' : null,
        })
        .onConflictDoNothing();
      filingCount += 1;
      if (past && slipped) overdueCount += 1;
      else if (past) filedCount += 1;
    }
  }
  console.log(
    `  ${filingCount} filing(s): ${filedCount} filed, ${overdueCount} overdue, ` +
      `${filingCount - filedCount - overdueCount} upcoming`,
  );

  /* ---- What to say at sign-in ---- */
  console.log('\nDone. Demo logins (every account uses the same password):');
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  ${emailFor(MANAGER)}  — ${MANAGER.name} (Project Manager, all six projects)`);
  for (const lead of LEADS) {
    console.log(`  ${emailFor(lead)}  — ${lead.name} (Project Lead)`);
  }
  for (const org of CLIENT_ORGS) {
    const mine = PROJECTS.filter((p) => p.clientKey === org.key).length;
    console.log(
      `  ${emailFor(org)}  — ${org.name} (client, ${mine} project${mine === 1 ? '' : 's'})`,
    );
  }
  console.log('\nFirm admins and super admins see all six projects without any extra step.');
  console.log('Remove all of it with the matching clean command.');
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main() {
  const remove = process.argv.includes('--remove');
  const target = process.env.DB_SECRET_ARN
    ? `RDS ${process.env.DB_NAME ?? ''} via ${process.env.DB_HOST}:${process.env.DB_PORT}`
    : (process.env.DATABASE_URL ?? '').replace(/:\/\/[^@]*@/, '://***@') || '(no database configured)';
  console.log(`Database: ${target}\n`);

  if (remove) {
    console.log('Removing the demo clients…');
    await removeDemoRows();
    console.log('\nDone. Nothing tagged for this demo is left in the database.');
    console.log(
      'The obligation master catalogue (compliance_obligations) stays — it is the ' +
        'static library the app ships with, not demo data.',
    );
  } else {
    await seed();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
