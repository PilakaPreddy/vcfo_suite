import { describe, expect, it } from 'vitest';
import type { Engagement } from '@/data/engagements';
import {
  internMayAccessEngagementDocuments,
  internVisibleDocuments,
} from '@/lib/documents/document-access';
import {
  collectIndexedVaultDocuments,
  collectVaultDocuments,
  formatVaultCommandHit,
  groupVaultDocuments,
  mergeVaultDocuments,
  scopeVaultDocumentsToEngagements,
  vaultFileNameMatches,
  vaultLocationLabel,
  vaultDocumentsFromPayload,
  vaultPhaseForItem,
  vaultSearchHits,
  type VaultDocument,
} from '@/lib/documents/vault-documents';

const internA = 'intern-a';
const internB = 'intern-b';

const assigned: Engagement = {
  id: 'eng-a',
  clientId: 'c-a',
  companyName: 'Acme Pvt Ltd',
  companyType: 'domestic',
  internId: internA,
  adminId: 'admin',
  createdAt: '2026-08-01T00:00:00.000Z',
  stage: 'Pre-Incorporation',
  health: 'on-track',
};

const otherIntern: Engagement = {
  id: 'eng-b',
  clientId: 'c-b',
  companyName: 'Beta Exports',
  companyType: 'domestic',
  internId: internB,
  adminId: 'admin',
  createdAt: '2026-08-01T00:00:00.000Z',
  stage: 'Post-Incorporation',
  health: 'on-track',
};

const memberOnly: Engagement = {
  id: 'eng-m',
  clientId: 'c-m',
  companyName: 'Member Co',
  companyType: 'domestic',
  internId: internB,
  adminId: 'admin',
  createdAt: '2026-08-01T00:00:00.000Z',
  stage: 'Pre-Incorporation',
  health: 'on-track',
};

function doc(
  engagement: Engagement,
  fileName: string,
  extra?: Partial<VaultDocument>,
): VaultDocument {
  return {
    id: `${engagement.id}:${fileName}`,
    engagementId: engagement.id,
    companyName: engagement.companyName,
    milestoneId: extra?.milestoneId ?? 'pre-1',
    milestoneTitle: extra?.milestoneTitle ?? 'Client details',
    bucket: extra?.bucket ?? 'Pre-Incorporation',
    section: extra?.section ?? 'KYC',
    fieldId: extra?.fieldId ?? 'pan',
    fieldLabel: extra?.fieldLabel ?? 'PAN card',
    fileName,
    storagePath: extra?.storagePath ?? `${engagement.id}/pan/1-${fileName}`,
    uploadedAt: extra?.uploadedAt ?? '2026-08-20T00:00:00.000Z',
    source: extra?.source ?? 'milestone',
    documentId: extra?.documentId,
  };
}

describe('intern document access (Path A)', () => {
  it('lets a lead read assigned-client docs and not another intern’s client', () => {
    expect(internMayAccessEngagementDocuments(internA, assigned)).toBe(true);
    expect(internMayAccessEngagementDocuments(internA, otherIntern)).toBe(false);
    expect(internMayAccessEngagementDocuments(internA, memberOnly, [memberOnly.id])).toBe(true);
    expect(internMayAccessEngagementDocuments(undefined, assigned)).toBe(false);
    expect(
      internMayAccessEngagementDocuments(internA, { ...memberOnly, leadIds: [internA] }),
    ).toBe(true);
  });

  it('strips another intern’s client documents from a mixed list', () => {
    const mixed = [doc(assigned, 'acme-pan.pdf'), doc(otherIntern, 'beta-gst.pdf')];
    const visible = internVisibleDocuments(internA, mixed, [assigned, otherIntern]);
    expect(visible.map((row) => row.fileName)).toEqual(['acme-pan.pdf']);
  });
});

describe('vault grouping', () => {
  it('groups by company then checklist step and keeps empty clients', () => {
    const groups = groupVaultDocuments([doc(assigned, 'acme-pan.pdf')], [assigned, otherIntern], {
      includeEmpty: true,
    });
    expect(groups.map((g) => g.companyName)).toEqual(['Acme Pvt Ltd', 'Beta Exports']);
    expect(groups[0]?.docCount).toBe(1);
    expect(groups[0]?.milestones[0]?.milestoneId).toBe('pre-1');
    expect(groups[1]?.docCount).toBe(0);
    expect(groups[1]?.milestones).toEqual([]);
  });

  it('does not surface another intern’s company when that engagement is not in scope', () => {
    const mixed = [doc(assigned, 'acme-pan.pdf'), doc(otherIntern, 'beta-gst.pdf')];
    const scoped = scopeVaultDocumentsToEngagements(mixed, [assigned]);
    const groups = groupVaultDocuments(scoped, [assigned], { includeEmpty: true });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.companyName).toBe('Acme Pvt Ltd');
    expect(groups[0]?.docCount).toBe(1);
  });

  it('maps indexed rows onto the checklist step when stepId is set', () => {
    const indexed = collectIndexedVaultDocuments(
      [
        {
          id: 'doc-1',
          engagementId: assigned.id,
          category: 'documents',
          fileName: 'spice-ack.pdf',
          objectKey: `${assigned.id}/spice/1-spice-ack.pdf`,
          stepId: 'pre-4',
          createdAt: '2026-08-21T00:00:00.000Z',
        },
      ],
      [assigned],
    );
    expect(indexed[0]?.milestoneId).toBe('pre-4');
    expect(indexed[0]?.source).toBe('index');
    expect(indexed[0]?.documentId).toBe('doc-1');
  });

  it('dedupes index rows that share a milestone storage path', () => {
    const path = `${assigned.id}/pan/1-acme-pan.pdf`;
    const merged = mergeVaultDocuments(
      [doc(assigned, 'acme-pan.pdf', { storagePath: path })],
      [
        doc(assigned, 'acme-pan.pdf', {
          id: 'index:dup',
          storagePath: path,
          source: 'index',
          documentId: 'dup',
        }),
      ],
    );
    expect(merged).toHaveLength(1);
  });

  it('maps a documents-table uuid onto the demo app engagement id', () => {
    const demo: Engagement = { ...assigned, id: 'e1' };
    const indexed = collectIndexedVaultDocuments(
      [
        {
          id: 'doc-uuid',
          engagementId: '11111111-1111-1111-1111-111111111101',
          category: 'documents',
          fileName: 'lead-upload.pdf',
          objectKey: '11111111-1111-1111-1111-111111111101/ack/1710000000000-lead-upload.pdf',
          stepId: 'pre-4',
          createdAt: '2026-08-21T00:00:00.000Z',
        },
      ],
      [demo],
    );
    expect(indexed[0]?.engagementId).toBe('e1');
    expect(indexed[0]?.companyName).toBe('Acme Pvt Ltd');
    const scoped = scopeVaultDocumentsToEngagements(indexed, [demo]);
    expect(scoped).toHaveLength(1);
  });

  it('groups FEMA filings and intern uploads under phase labels', () => {
    const internAck = doc(assigned, 'name-ack.pdf', {
      milestoneId: 'pre-4',
      milestoneTitle: 'Name reservation',
      bucket: 'Pre-Incorporation',
    });
    const fcgpr = doc(assigned, 'fcgpr.pdf', {
      milestoneId: 'reg-20',
      milestoneTitle: 'FCGPR Filing',
      bucket: 'Registration',
    });
    const gst = doc(assigned, 'gst.pdf', {
      milestoneId: 'reg-1',
      milestoneTitle: 'GST Registration',
      bucket: 'Registration',
    });
    const groups = groupVaultDocuments([internAck, fcgpr, gst], [assigned]);
    expect(groups[0]?.phases.map((phase) => phase.phaseKey)).toEqual([
      'pre-inc',
      'fema',
      'statutory',
    ]);
    expect(vaultPhaseForItem({ bucket: 'statutory', title: 'FCGPR Filing' })).toBe('fema');
    expect(vaultPhaseForItem({ bucket: 'statutory', title: 'GST Registration' })).toBe('statutory');
  });

  it('matches by file name and shows company plus phase path', () => {
    const gstr = doc(assigned, 'GSTR-1.pdf', {
      milestoneId: 'reg-1',
      milestoneTitle: 'GST Registration',
      bucket: 'Registration',
      section: 'Returns',
    });
    expect(vaultFileNameMatches(gstr, 'gstr-1')).toBe(true);
    expect(vaultFileNameMatches(gstr, 'epfo')).toBe(false);
    expect(vaultFileNameMatches({ ...gstr, fileName: undefined as unknown as string }, 'gstr')).toBe(false);
    expect(formatVaultCommandHit(gstr)).toBe('GSTR-1.pdf — Acme Pvt Ltd · Statutory');
    expect(vaultLocationLabel(gstr)).toBe('Statutory · GST Registration · Returns');
    const hits = vaultSearchHits([gstr, doc(otherIntern, 'other.pdf')], 'GSTR-1');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.companyName).toBe('Acme Pvt Ltd');
  });

  it('collects intern checklist uploads from file fields', () => {
    const path = `${assigned.id}/nameApplicationAcknowledgementUrl/1710000000000-name-ack.pdf`;
    const collected = collectVaultDocuments([assigned], () => ({
      'pre-4': {
        status: 'in-progress',
        responses: { nameApplicationAcknowledgementUrl: path },
      },
    }));
    expect(collected).toHaveLength(1);
    expect(collected[0]?.fileName).toBe('name-ack.pdf');
    expect(collected[0]?.bucket).toBe('Pre-incorporation');
    expect(collected[0]?.milestoneId).toBe('pre-4');
  });
});

describe('vault documents from the server read', () => {
  it('maps file nodes onto steps and categories and leaves missing rows out', () => {
    const base = { replaced: false, from: 'Acme', fromSbc: false, categoryId: 'c1' as const };
    const docs = vaultDocumentsFromPayload(
      {
        engagementId: 'eng-a',
        companyName: 'Acme Pvt Ltd',
        companyShort: 'Acme',
        openRequests: [],
        accept: { exts: [], maxLabel: '' },
        nodes: [
          { ...base, id: 'm-pre-1-pan', ref: 'm:eng-a/pan/1-pan.pdf', label: 'PAN', fileName: 'pan.pdf', status: 'Approved', stepId: 'pre-1', source: 'milestone' },
          { ...base, id: 'd-doc-1', ref: 'd:doc-1', label: 'Lease', fileName: 'lease.pdf', status: 'Final', source: 'index' },
          { ...base, id: 'req-1', label: 'Bank letter', fileName: '—', status: 'Missing', source: 'request' },
        ],
      },
      'eng-a',
    );
    expect(docs.map((d) => d.id)).toEqual(['m-pre-1-pan', 'd-doc-1']);
    expect(docs[0]).toMatchObject({ milestoneId: 'pre-1', storagePath: 'eng-a/pan/1-pan.pdf', section: 'Identity & KYC', source: 'milestone' });
    expect(docs[1]).toMatchObject({ documentId: 'doc-1', milestoneTitle: 'Other documents', bucket: 'Statutory' });
  });
});
