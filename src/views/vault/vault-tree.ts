import { sep } from '@/lib/date-format';
import type { VaultDocument, VaultEntityGroup } from '@/lib/documents/vault-documents';
import { internOverviewPhases } from '@/lib/intern/intern-overview-progress';

/*
 * Tree model for the staff Vault explorer (K-39). Pure functions, so the tree can be tested
 * without rendering the page.
 */

export type VaultTreeView = 'step' | 'cat';

/** One row of the tree: a folder or a file, with its depth for the indent guides. */
export type VaultTreeRow =
  | { kind: 'folder'; id: string; label: string; depth: number; count: number }
  | { kind: 'file'; id: string; doc: VaultDocument; depth: number; tag?: string; sub?: string };

/** Plain date for a file ("14 Oct 2026"), or a dash when the upload time is unknown. */
export function formatUploadDate(iso: string | null): string {
  if (!iso) return '—';
  return sep(
    new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  );
}

const STEP_PHASES: Array<{ key: string; label: string }> = [
  { key: 'pre-inc-phase-1', label: 'Phase 1 · Name application' },
  { key: 'pre-inc-phase-2', label: 'Phase 2 · Incorporation' },
  { key: 'post-inc-phase-3', label: 'Phase 3 · Post-incorporation' },
  { key: 'registration-phase-4', label: 'Registrations' },
];

/**
 * The tree's folders as the record names them (prototype `DocumentsExplorer`): "Phase 1 · Name
 * application" over "3 · Signed Board Resolution", numbered across the phases. Steps outside the
 * four phases stay in their own group under its own label.
 */
export function withStepPhases(entity: VaultEntityGroup): VaultEntityGroup {
  const catalog = internOverviewPhases();
  let before = 0;
  const place = new Map<string, { phase: string; n: number }>();
  for (const p of catalog) {
    p.items.forEach((it, i) => place.set(it.id, { phase: p.id, n: p.id === 'registration-phase-4' ? i + 1 : before + i + 1 }));
    before += p.items.length;
  }
  const out: VaultEntityGroup['phases'] = [];
  for (const def of STEP_PHASES) {
    const milestones = (entity.phases ?? [])
      .flatMap((ph) => ph.milestones)
      .filter((m) => place.get(m.milestoneId)?.phase === def.key)
      .map((m) => ({ ...m, milestoneTitle: `${place.get(m.milestoneId)!.n} · ${m.milestoneTitle}` }));
    if (milestones.length) {
      out.push({
        phaseKey: def.key as VaultEntityGroup['phases'][number]['phaseKey'],
        phaseLabel: def.label,
        milestones,
        docCount: milestones.reduce((n, m) => n + m.docCount, 0),
      });
    }
  }
  for (const ph of entity.phases ?? []) {
    const rest = ph.milestones.filter((m) => !place.has(m.milestoneId));
    if (rest.length) out.push({ ...ph, milestones: rest, docCount: rest.reduce((n, m) => n + m.docCount, 0) });
  }
  return { ...entity, phases: out };
}

/**
 * Flatten one client's documents into tree rows. Folders whose id is in `closed` hide their
 * children. In step view a step with more than one section tags each file with its section.
 */
export function buildVaultTree(
  entity: VaultEntityGroup,
  view: VaultTreeView,
  closed: Set<string>,
): VaultTreeRow[] {
  const rows: VaultTreeRow[] = [];
  if (view === 'step') {
    for (const phase of entity.phases ?? []) {
      const phaseId = `phase:${phase.phaseKey}`;
      rows.push({ kind: 'folder', id: phaseId, label: phase.phaseLabel, depth: 0, count: phase.docCount });
      if (closed.has(phaseId)) continue;
      for (const milestone of phase.milestones) {
        const stepId = `${phaseId}:${milestone.milestoneId}`;
        rows.push({
          kind: 'folder',
          id: stepId,
          label: milestone.milestoneTitle,
          depth: 1,
          count: milestone.docCount,
        });
        if (closed.has(stepId)) continue;
        const many = milestone.sections.length > 1;
        for (const section of milestone.sections) {
          for (const doc of section.docs) {
            rows.push({ kind: 'file', id: doc.id, doc, depth: 2, tag: many ? section.section : undefined });
          }
        }
      }
    }
    return rows;
  }

  const bySection = new Map<string, VaultDocument[]>();
  for (const milestone of entity.milestones) {
    for (const section of milestone.sections) {
      const list = bySection.get(section.section) ?? [];
      list.push(...section.docs);
      bySection.set(section.section, list);
    }
  }
  for (const [section, docs] of [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `cat:${section}`;
    rows.push({ kind: 'folder', id, label: section, depth: 0, count: docs.length });
    if (closed.has(id)) continue;
    for (const doc of docs) rows.push({ kind: 'file', id: doc.id, doc, depth: 1, sub: doc.milestoneTitle });
  }
  return rows;
}
