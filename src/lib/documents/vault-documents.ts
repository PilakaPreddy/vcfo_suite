import { checklist, getItem, type ChecklistItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { repeatFieldLabel } from '@/lib/checklist/checklist-repeat';
import { internRegistrationHeadingForTitle } from '@/lib/intern/intern-overview-progress';
import { appEngagementId, engagementIdAliases } from '@/lib/projects/legacy-engagement-ids';
import { DOC_CATEGORIES, type ClientDocumentsPayload, type DocNode } from '@/lib/client-portal/documents';
import {
  fileNameFromStoragePath,
  isMilestoneStoragePath,
  uploadTimestampFromStoragePath,
} from '@/lib/documents/milestone-document-storage';

type VaultDocumentSource = DocNode['source'];

export interface VaultDocument {
  id: string;
  engagementId: string;
  companyName: string;
  milestoneId: string;
  milestoneTitle: string;
  bucket: string;
  section: string;
  fieldId: string;
  fieldLabel: string;
  fileName: string;
  storagePath: string;
  uploadedAt: string | null;
  source?: VaultDocumentSource;
  /** documents-table row id when source is `index`. */
  documentId?: string;
  /** The server's node when the file came from the engagement's documents read. */
  node?: DocNode;
}

/** Indexed files that are not tied to a checklist step. */
const INDEXED_MILESTONE_ID = '_indexed';

export type VaultPhaseKey = 'pre-inc' | 'post-inc' | 'fema' | 'statutory';

const VAULT_PHASE_ORDER: VaultPhaseKey[] = ['pre-inc', 'post-inc', 'fema', 'statutory'];

const VAULT_PHASE_LABEL: Record<VaultPhaseKey, string> = {
  'pre-inc': 'Pre-incorporation',
  'post-inc': 'Post-incorporation',
  fema: 'FEMA',
  statutory: 'Statutory',
};

/** Map a catalog item onto the four vault phases (FEMA filings nest out of statutory). */
export function vaultPhaseForItem(item: Pick<ChecklistItem, 'bucket' | 'title'>): VaultPhaseKey {
  if (item.bucket === 'pre-inc') return 'pre-inc';
  if (item.bucket === 'post-inc') return 'post-inc';
  if (item.bucket === 'fema') return 'fema';
  if (internRegistrationHeadingForTitle(item.title) === 'FEMA') return 'fema';
  return 'statutory';
}

function vaultPhaseForDocument(doc: VaultDocument): VaultPhaseKey {
  const item = getItem(doc.milestoneId);
  if (item) return vaultPhaseForItem(item);
  const label = doc.bucket.trim().toLowerCase();
  if (label.startsWith('pre')) return 'pre-inc';
  if (label.startsWith('post')) return 'post-inc';
  if (label.includes('fema')) return 'fema';
  return 'statutory';
}

export function checklistItemForFieldId(fieldId: string): ChecklistItem | undefined {
  const trimmed = fieldId.trim();
  if (!trimmed) return undefined;
  return checklist.find((item) =>
    getClientResponseFields(item).some((field) => field.id === trimmed),
  );
}

function engagementForVaultId(
  engagements: Engagement[],
  engagementId: string,
): Engagement | undefined {
  const aliases = new Set(engagementIdAliases(engagementId));
  return engagements.find((engagement) =>
    engagementIdAliases(engagement.id).some((id) => aliases.has(id)),
  );
}

export interface IndexedDocumentRow {
  id: string;
  engagementId: string;
  category: string | null;
  fileName: string;
  objectKey: string;
  stepId: string | null;
  createdAt: string;
  companyName?: string | null;
}

interface VaultSectionGroup {
  section: string;
  docs: VaultDocument[];
}

interface VaultMilestoneGroup {
  milestoneId: string;
  milestoneTitle: string;
  bucket: string;
  sections: VaultSectionGroup[];
  docCount: number;
}

interface VaultPhaseGroup {
  phaseKey: VaultPhaseKey;
  phaseLabel: string;
  milestones: VaultMilestoneGroup[];
  docCount: number;
}

export interface VaultEntityGroup {
  engagementId: string;
  companyName: string;
  stage: Engagement['stage'];
  slug?: string;
  phases: VaultPhaseGroup[];
  milestones: VaultMilestoneGroup[];
  docCount: number;
}

export interface VaultSearchHit {
  doc: VaultDocument;
  companyName: string;
  location: string;
}

function milestoneOrder(a: ChecklistItem, b: ChecklistItem): number {
  if (a.bucket !== b.bucket) {
    const bucketOrder = ['pre-inc', 'post-inc', 'fema', 'statutory'];
    return bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket);
  }
  return a.order - b.order;
}

function titleCaseCategory(category: string): string {
  const known: Record<string, string> = {
    documents: 'Documents',
    images: 'Images',
    reports: 'Reports',
    deliverables: 'Deliverables',
  };
  if (known[category]) return known[category];
  return category
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function milestoneGroup(
  milestoneId: string,
  milestoneTitle: string,
  bucket: string,
  milestoneDocs: VaultDocument[],
): VaultMilestoneGroup {
  const docsBySection = new Map<string, VaultDocument[]>();
  for (const doc of milestoneDocs) {
    const list = docsBySection.get(doc.section) ?? [];
    list.push(doc);
    docsBySection.set(doc.section, list);
  }

  const sections: VaultSectionGroup[] = [...docsBySection.entries()].map(([section, sectionDocs]) => ({
    section,
    docs: sectionDocs.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? '')),
  }));

  return {
    milestoneId,
    milestoneTitle,
    bucket,
    sections,
    docCount: milestoneDocs.length,
  };
}

function milestonesFromDocs(engagementDocs: VaultDocument[]): VaultMilestoneGroup[] {
  const docsByMilestone = new Map<string, VaultDocument[]>();
  for (const doc of engagementDocs) {
    const list = docsByMilestone.get(doc.milestoneId) ?? [];
    list.push(doc);
    docsByMilestone.set(doc.milestoneId, list);
  }

  const milestones: VaultMilestoneGroup[] = [];
  const used = new Set<string>();
  const orderedItems = checklist
    .filter((item) => docsByMilestone.has(item.id))
    .sort(milestoneOrder);

  for (const item of orderedItems) {
    used.add(item.id);
    milestones.push(
      milestoneGroup(
        item.id,
        item.title,
        VAULT_PHASE_LABEL[vaultPhaseForItem(item)],
        docsByMilestone.get(item.id)!,
      ),
    );
  }

  for (const [milestoneId, milestoneDocs] of docsByMilestone) {
    if (used.has(milestoneId)) continue;
    const sample = milestoneDocs[0];
    milestones.push(
      milestoneGroup(
        milestoneId,
        sample?.milestoneTitle ?? 'Other files',
        sample?.bucket ?? 'Files',
        milestoneDocs,
      ),
    );
  }

  return milestones;
}

function phasesFromMilestones(milestones: VaultMilestoneGroup[]): VaultPhaseGroup[] {
  const byPhase = new Map<VaultPhaseKey, VaultMilestoneGroup[]>();
  for (const milestone of milestones) {
    const sample = milestone.sections[0]?.docs[0];
    const item = getItem(milestone.milestoneId);
    const key = sample
      ? vaultPhaseForDocument(sample)
      : item
        ? vaultPhaseForItem(item)
        : 'statutory';
    const list = byPhase.get(key) ?? [];
    list.push(milestone);
    byPhase.set(key, list);
  }

  return VAULT_PHASE_ORDER.flatMap((key) => {
    const phaseMilestones = byPhase.get(key);
    if (!phaseMilestones?.length) return [];
    return [
      {
        phaseKey: key,
        phaseLabel: VAULT_PHASE_LABEL[key],
        milestones: phaseMilestones,
        docCount: phaseMilestones.reduce((sum, milestone) => sum + milestone.docCount, 0),
      },
    ];
  });
}

function withEntityPhases(
  entity: Omit<VaultEntityGroup, 'phases'> & { phases?: VaultPhaseGroup[] },
): VaultEntityGroup {
  return { ...entity, phases: phasesFromMilestones(entity.milestones) };
}

/** Collect file uploads from checklist responses across engagements. */
export function collectVaultDocuments(
  engagements: Engagement[],
  getStateForEngagement: (engagement: Engagement) => Record<string, ChecklistItemStateSlice>,
): VaultDocument[] {
  const docs: VaultDocument[] = [];

  for (const engagement of engagements) {
    const state = getStateForEngagement(engagement);

    for (const item of checklist) {
      const slice = state[item.id];
      if (!slice) continue;

      const responses = extractItemResponses(item, slice);
      const fields = getClientResponseFields(item);
      const fieldById = new Map(fields.map((field) => [field.id, field]));
      const used = new Set<string>();
      const phaseKey = vaultPhaseForItem(item);
      const phaseLabel = VAULT_PHASE_LABEL[phaseKey];

      const addPath = (fieldId: string, storagePath: string, fieldLabel: string, section: string) => {
        const ts = uploadTimestampFromStoragePath(storagePath);
        docs.push({
          id: `${engagement.id}:${item.id}:${fieldId}`,
          engagementId: engagement.id,
          companyName: engagement.companyName,
          milestoneId: item.id,
          milestoneTitle: item.title,
          bucket: phaseLabel,
          section,
          fieldId,
          fieldLabel,
          fileName: fileNameFromStoragePath(storagePath),
          storagePath,
          uploadedAt: ts ? new Date(ts).toISOString() : null,
          source: 'milestone',
        });
      };

      for (const field of fields) {
        if (field.type !== 'file') continue;
        const storagePath = (responses[field.id] ?? '').trim();
        if (!isMilestoneStoragePath(storagePath)) continue;
        used.add(field.id);
        addPath(field.id, storagePath, field.label, field.section ?? item.title);
      }

      // Lead uploads stored as a path on a non-file key still belong in the
      // vault — including repeat-entry uploads ("Copy of passport · Director 2").
      for (const [fieldId, value] of Object.entries(responses)) {
        if (used.has(fieldId) || !isMilestoneStoragePath(value)) continue;
        const field = fieldById.get(fieldId);
        const label = field?.label ?? repeatFieldLabel(fields, responses, fieldId) ?? fieldId;
        const groupSection = fieldById.get(fieldId.split('.')[0] ?? '')?.section;
        addPath(fieldId, value.trim(), label, field?.section ?? groupSection ?? item.title);
      }
    }
  }

  return docs.sort((a, b) => {
    const byCompany = a.companyName.localeCompare(b.companyName);
    if (byCompany !== 0) return byCompany;
    return (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? '');
  });
}

/**
 * One engagement's files from the server's documents read (the client Documents page's data),
 * as vault files: phase and step from the node's step, section from its category. Missing rows
 * (open requests) have no file and stay out; the requests card shows them.
 */
export function vaultDocumentsFromPayload(payload: ClientDocumentsPayload, engagementId: string): VaultDocument[] {
  return payload.nodes.flatMap((node): VaultDocument[] => {
    if (!node.ref) return [];
    const item = node.stepId ? getItem(node.stepId) : undefined;
    return [
      {
        id: node.id,
        engagementId,
        companyName: payload.companyName,
        milestoneId: item?.id ?? INDEXED_MILESTONE_ID,
        milestoneTitle: item?.title ?? 'Other documents',
        bucket: VAULT_PHASE_LABEL[item ? vaultPhaseForItem(item) : 'statutory'],
        section: DOC_CATEGORIES.find((c) => c.id === node.categoryId)?.name ?? 'Other',
        fieldId: node.id,
        fieldLabel: node.label,
        fileName: node.fileName,
        storagePath: node.ref.startsWith('m:') ? node.ref.slice(2) : '',
        uploadedAt: node.date ?? null,
        source: node.source,
        documentId: node.ref.startsWith('d:') ? node.ref.slice(2) : undefined,
        node,
      },
    ];
  });
}

/** Map documents-table index rows onto the same checklist taxonomy. */
export function collectIndexedVaultDocuments(
  rows: IndexedDocumentRow[],
  engagements: Engagement[],
): VaultDocument[] {
  const byIdLookup = (engagementId: string) => engagementForVaultId(engagements, engagementId);
  const docs: VaultDocument[] = [];

  for (const row of rows) {
    const engagement = byIdLookup(row.engagementId);
    const item = row.stepId ? getItem(row.stepId) : undefined;
    const category = row.category?.trim() || '';
    const section = item
      ? category
        ? titleCaseCategory(category)
        : item.title
      : titleCaseCategory(category) || 'Other';
    const phaseKey = item ? vaultPhaseForItem(item) : 'statutory';
    const appId = engagement?.id ?? appEngagementId(row.engagementId);

    docs.push({
      id: `index:${row.id}`,
      engagementId: appId,
      companyName: row.companyName?.trim() || engagement?.companyName || 'Unknown company',
      milestoneId: item?.id ?? INDEXED_MILESTONE_ID,
      milestoneTitle: item?.title ?? (category ? titleCaseCategory(category) : 'Other files'),
      bucket: VAULT_PHASE_LABEL[phaseKey],
      section,
      fieldId: row.id,
      fieldLabel: row.fileName,
      fileName: row.fileName,
      storagePath: row.objectKey,
      uploadedAt: row.createdAt,
      source: 'index',
      documentId: row.id,
    });
  }

  return docs;
}

/** Deduplicate milestone + index rows that point at the same object. */
export function mergeVaultDocuments(...lists: VaultDocument[][]): VaultDocument[] {
  const seen = new Set<string>();
  const out: VaultDocument[] = [];
  for (const list of lists) {
    for (const doc of list) {
      const key = `${appEngagementId(doc.engagementId)}:${doc.storagePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(doc);
    }
  }
  return out;
}

/** Drop documents that do not belong to the caller’s accessible engagements. */
export function scopeVaultDocumentsToEngagements(
  docs: VaultDocument[],
  engagements: Engagement[],
): VaultDocument[] {
  const ids = new Set(engagements.flatMap((engagement) => engagementIdAliases(engagement.id)));
  return docs.filter((doc) => engagementIdAliases(doc.engagementId).some((id) => ids.has(id)));
}

export function vaultFileNameMatches(doc: VaultDocument, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    (doc.fileName ?? '').toLowerCase().includes(q) ||
    (doc.fieldLabel ?? '').toLowerCase().includes(q)
  );
}

export function vaultLocationLabel(doc: VaultDocument): string {
  const phase = VAULT_PHASE_LABEL[vaultPhaseForDocument(doc)];
  const parts: string[] = [];
  if (phase) parts.push(phase);
  if (doc.milestoneTitle && doc.milestoneTitle !== phase) parts.push(doc.milestoneTitle);
  if (doc.section && doc.section !== doc.milestoneTitle && doc.section !== phase) {
    parts.push(doc.section);
  }
  return parts.join(' · ');
}

/** Command palette line: `GSTR-1.pdf — DemoCo · Pre-incorporation`. */
export function formatVaultCommandHit(doc: VaultDocument): string {
  const phase = VAULT_PHASE_LABEL[vaultPhaseForDocument(doc)];
  return `${doc.fileName} — ${doc.companyName} · ${phase}`;
}

export function vaultSearchHits(docs: VaultDocument[], query: string): VaultSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  return docs
    .filter((doc) => vaultDocMatchesQuery(doc, q))
    .map((doc) => ({
      doc,
      companyName: doc.companyName,
      location: vaultLocationLabel(doc),
    }));
}

function vaultDocMatchesQuery(doc: VaultDocument, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (doc.fileName ?? '').toLowerCase().includes(q) ||
    (doc.fieldLabel ?? '').toLowerCase().includes(q) ||
    (doc.section ?? '').toLowerCase().includes(q) ||
    (doc.milestoneTitle ?? '').toLowerCase().includes(q) ||
    (doc.companyName ?? '').toLowerCase().includes(q)
  );
}

/** Group flat vault documents by entity → phase → checklist step → section. */
export function groupVaultDocuments(
  docs: VaultDocument[],
  engagements: Engagement[],
  options?: { includeEmpty?: boolean },
): VaultEntityGroup[] {
  const docsByEngagement = new Map<string, VaultDocument[]>();
  for (const doc of docs) {
    const key = appEngagementId(doc.engagementId);
    const list = docsByEngagement.get(key) ?? [];
    list.push(doc);
    docsByEngagement.set(key, list);
  }

  const groups: VaultEntityGroup[] = [];
  const seen = new Set<string>();

  const takeDocs = (engagementId: string): VaultDocument[] => {
    const out: VaultDocument[] = [];
    const used = new Set<string>();
    for (const alias of engagementIdAliases(engagementId)) {
      for (const doc of docsByEngagement.get(appEngagementId(alias)) ?? []) {
        if (used.has(doc.id)) continue;
        used.add(doc.id);
        out.push(doc);
      }
      seen.add(alias);
      seen.add(appEngagementId(alias));
    }
    return out;
  };

  for (const engagement of engagements) {
    const engagementDocs = takeDocs(engagement.id);
    if (!engagementDocs.length && !options?.includeEmpty) continue;

    groups.push(
      withEntityPhases({
        engagementId: engagement.id,
        companyName: engagement.companyName,
        stage: engagement.stage,
        slug: engagement.slug,
        milestones: milestonesFromDocs(engagementDocs),
        docCount: engagementDocs.length,
      }),
    );
  }

  for (const [engagementId, engagementDocs] of docsByEngagement) {
    if (seen.has(engagementId) || engagementDocs.length === 0) continue;
    const sample = engagementDocs[0];
    groups.push(
      withEntityPhases({
        engagementId,
        companyName: sample?.companyName ?? 'Unknown company',
        stage: 'Pre-Incorporation',
        milestones: milestonesFromDocs(engagementDocs),
        docCount: engagementDocs.length,
      }),
    );
  }

  return groups;
}
