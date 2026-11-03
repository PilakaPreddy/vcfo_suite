'use client';

/**
 * Incorporation pages — data + the prototype's copy and helpers, fed by the
 * real step model (`usePortalIncorporation`, src/lib/client-portal/step-model.ts),
 * the client overview (team, COI, deliverables) and `GET /api/client/incorporation`
 * (file requests, upload metadata, window setter, board-resolution people).
 */
import { companyShortName } from '@/lib/client-portal/company';
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { useClientOverview } from '@/hooks/use-client-overview';
import { clientIncorporationStepPath } from '@/lib/projects/project-step-path';
import { subStepsOf, type SubStep } from '@/lib/client-portal/step-progress';
import { usePortalIncorporation, todayIST } from '../../hooks';
import { usePortal, type DrillRow, type DrillTab, type WhatsThisAnswer } from '../../PortalProvider';
import type { PortalStep, PortalPhase, PortalIncorporationModel } from '@/lib/client-portal/step-model';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import type { ClientIncorporationExtras, ClientFileRequestDto } from '@/lib/client-portal/incorporation-types';
import { fmt, type GlyphKind, type OwnKey } from './ui';

/* ---------------- prototype constants (Northwind → the client's short name) ---------------- */

export const PH = ['Name Application', 'Incorporation', 'Post-Incorporation', 'Registration'];
export const PHL = ['SPICe+ Part A', 'SPICe+ Part B', 'Post-incorporation', 'Registration'];
const PH_TIP = [
  'SPICe+ Part A · name approval with MCA',
  'SPICe+ Part B · the company is formed',
  'Post-incorporation · the first 180 days',
  'Registrations · tax, labour, trade and FEMA',
];
const phInfo = (s: string) => [
  `Name approval with MCA (SPICe+ Part A): ${s}’s details, the board resolution, and the name application SBC files for ${s}.`,
  'SPICe+ Part B: capital, registered office, directors and subscribers, KYC and DSC, the filing, and the Certificate of Incorporation.',
  'What a new company must do in its first months: board meeting, bank account, share capital, share certificates and ROC filings.',
  'The registrations the company needs to operate, grouped as in VCFO Suite: General, Customs, Foreign Trade, Labour, Local Compliance, IP/Brand and FEMA.',
];
const phWhy = (s: string) => [
  'Nothing else can start until MCA approves the company name.',
  `It ends with the Certificate of Incorporation: ${s} exists from that date.`,
  'Most of these have legal deadlines counted from the incorporation date (30 to 180 days).',
  'The company needs these to invoice, hire and trade; GST comes first.',
];
const PH_SRC = [
  'Companies Act 2013 · SPICe+ Part A (RUN)',
  'Companies Act 2013 · SPICe+ Part B, AGILE-PRO-S',
  'Companies Act 2013 · INC-20A, ADT-1, SH-1',
  'GST, labour, trade and FEMA rules',
];
export const PH_WAIT = [
  '',
  '',
  'Post-incorporation starts once the Certificate of Incorporation is issued.',
  'Registrations start after the Certificate of Incorporation. GST comes first.',
];
const INFO_WHY: Record<string, string> = {
  coi: 'It is the date your company legally exists; everything after it is counted from that day.',
  phases: 'It shows at a glance which phase is late, on time or not started.',
  docs: 'Missing or old documents are the most common reason MCA sends a filing back.',
  noc: 'Without it MCA rejects the registered office proof.',
  timeline: 'It shows who did what and when, so nothing waits unnoticed.',
};

export type K = 'done' | 'you' | 'prog' | 'with' | 'up';
export type LK = K | 'next';
export const KL: Record<LK, string> = { done: 'Done', you: 'Waiting', prog: 'In progress', with: 'With SBC', up: 'Upcoming', next: 'Next' };
/* Drill tab colours: the status tokens (R-03, R-13). */
const KCOL: Record<K, string> = { done: 'oklch(var(--positive-mid))', you: 'oklch(var(--waiting-mid))', prog: 'oklch(var(--brand))', with: 'oklch(var(--brand))', up: 'oklch(var(--upcoming-mid))' };
/* Drill tab order (prototype stepsDrill): what needs the client first, done and upcoming last. */
const KORD: K[] = ['you', 'prog', 'with', 'done', 'up'];
const KTONE: Record<K, ChipTone> = { done: 'ok', you: 'teal', prog: 'prog', with: 'prog', up: 'idle' };

/* ---------------- per-step helpers ---------------- */

/** KD: the real kind on the phase / step pages ("Next" is a landing-table label only). */
export function kd(s: PortalStep): K {
  return s.kind === 'next' ? 'up' : s.kind;
}
/** Landing table kind (lkind). */
function lkind(s: PortalStep): LK {
  return s.kind;
}
/** Glyph: late steps (not done, past their window) show the red ×. */
function glyph(s: PortalStep, k: LK = kd(s)): GlyphKind {
  if (s.late && k !== 'done') return 'late';
  return k === 'next' ? 'up' : k;
}
export function ownKey(s: PortalStep): OwnKey {
  return s.owner === 'client' ? 'You' : s.owner === 'mca' ? 'MCA' : 'SBC';
}
export function stepHrefOf(s: PortalStep): string {
  return clientIncorporationStepPath(s.item);
}

export function dateCell(s: PortalStep, coiExpected?: string): string {
  const k = kd(s);
  if (k === 'done') return s.doneOn ? `Done ${fmt(s.doneOn)}` : 'Done';
  if (k === 'you' || k === 'prog') return s.due ? `Due ${fmt(s.due)}` : '—';
  if (k === 'with') return s.since ? `Since ${fmt(s.since)}` : s.due ? `Due ${fmt(s.due)}` : '—';
  if (s.id === 'pre-12' && coiExpected) return `Exp. ${fmt(coiExpected)}`;
  // C-189: an upcoming step with a planned window reads "Planned 12 Oct".
  return s.due ? `Planned ${fmt(s.due)}` : '—';
}

export function tipTxt(s: PortalStep, k: LK = kd(s)): string {
  const parts: string[] = [KL[k]];
  if (k === 'done') {
    if (s.doneOn) parts.push(fmt(s.doneOn));
  } else if (k === 'with') {
    if (s.since) parts.push(`since ${fmt(s.since)}`);
    if (s.due) parts.push(`due ${fmt(s.due)}`);
  } else if (k === 'up' || k === 'next') {
    if (s.due) parts.push(`planned ${fmt(s.due)}`);
  } else if (s.due) parts.push(`due ${fmt(s.due)}`);
  if (s.late && k !== 'done') parts.push(`late by ${s.lateDays} day${s.lateDays === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function railSub(s: PortalStep, short: string): string {
  const k = kd(s);
  if (k === 'done') return s.doneOn ? `Done · ${fmt(s.doneOn)}` : 'Done';
  if (k === 'you') return `Waiting on ${short}${s.due ? ` · due ${fmt(s.due)}` : ''}`;
  if (k === 'prog') return `In progress${s.due ? ` · due ${fmt(s.due)}` : ''}`;
  if (k === 'with') return `With ${short}’s project lead${s.since ? ` · since ${fmt(s.since)}` : ''}`;
  return s.due ? `Opens later · due ${fmt(s.due)}` : 'Opens later';
}

export type { SubStep } from '@/lib/client-portal/step-progress';

/** Sub-steps of a step: its field sections (or fields) with the filled state from the real answers (G-10). */
export function subList(s: PortalStep): SubStep[] {
  const k = kd(s);
  return subStepsOf(s.item, (s.slice?.responses ?? {}) as Record<string, string>, k === 'done' ? 'done' : k === 'up' ? 'up' : 'live');
}

/* ---------------- drill helpers (rule 14) ---------------- */

export function stRow(s: PortalStep, coi?: string): DrillRow {
  const k = kd(s);
  const late = Boolean(s.late && k !== 'done');
  return {
    title: s.title,
    meta: dateCell(s, coi),
    chip: late ? 'Overdue' : KL[k],
    chipColor: KCOL[k],
    tone: late ? 'bad' : KTONE[k],
    step: {
      n: s.n,
      state: k === 'done' ? 'done' : k === 'up' ? 'next' : 'now',
      tone: late ? 'bad' : k === 'you' ? 'teal' : 'prog',
      owner: s.owner === 'client' ? 'client' : s.owner === 'mca' ? 'mca' : 'sbc',
      late,
    },
    href: stepHrefOf(s),
  };
}

export function tabsFor(list: PortalStep[], coi?: string): Array<DrillTab & { k: K }> {
  return KORD.map((k) => ({
    k,
    label: KL[k],
    color: KCOL[k],
    rows: list.filter((x) => kd(x) === k).map((x) => stRow(x, coi)),
  })).filter((t) => t.rows.length);
}

export function idx(tabs: Array<{ k: string }>, k: string): number {
  const i = tabs.findIndex((t) => t.k === k);
  return i < 0 ? 0 : i;
}
function phKind(p: PortalPhase): GlyphKind {
  return p.state === 'done' ? 'done' : p.state === 'up' ? 'up' : 'prog';
}
/** Latest done date in the phase (prototype `phEnd` for done phases). */
export function phDoneEnd(p: PortalPhase): string | undefined {
  return p.steps.map((s) => s.doneOn).filter(Boolean).sort().at(-1) as string | undefined;
}

/**
 * Plan window of a phase. Part A / B: the manager's windows (the incorporation
 * window, or per-step windows when set). Post-inc. / Registration: from the
 * COI to the latest step date in the phase (DECISIONS).
 */
export function phPlan(p: PortalPhase, coi?: string): [string, string] | null {
  if (p.no === 1) {
    // Part A is judged against its own plan (the latest own step window in
    // the phase), not the whole incorporation window ending at the COI (TL-05).
    const own = p.steps.filter((s) => s.ownWindow && s.due);
    if (own.length) {
      const from = own.map((s) => s.windowFrom ?? s.due!).sort()[0]!;
      const to = own.map((s) => s.due!).sort().at(-1)!;
      return [from, to];
    }
  }
  if (p.no <= 2) {
    if (p.start && p.end) return [p.start, p.end];
    return null;
  }
  const dates = p.steps.map((s) => s.due ?? s.doneOn).filter(Boolean).sort() as string[];
  const end = dates.at(-1);
  const start = coi ?? p.start;
  if (!start) return null;
  // No step dates yet: a fixed planned stretch after the COI (prototype's hatched bar).
  if (!end) return [start, addDays(start, p.no === 3 ? 30 : 45)];
  return start <= end ? [start, end] : [end, start];
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/* ---------------- What's this? answers (OV-05) ---------------- */

export function stepAnswer(s: PortalStep, short: string): WhatsThisAnswer {
  const forms = s.item.forms ?? [];
  return {
    title: s.title,
    text: s.item.description ?? s.item.infoRequired.join(' · '),
    why:
      s.owner === 'client'
        ? `${short} owns this step: ${short}’s answers and documents go into the ${forms[0] || 'filing'}.`
        : 'SBC does this step for you; you see the result and approve it.',
    source: `${forms.length ? `${forms.join(', ')} · ` : ''}VCFO Suite checklist, step ${s.n}`,
    href: stepHrefOf(s),
  };
}

export function phaseAnswer(p: PortalPhase, short: string, href: string): WhatsThisAnswer {
  const i = p.no - 1;
  const first = p.steps[0]?.n;
  const last = p.steps.at(-1)?.n;
  return {
    title: `Phase ${p.no} · ${PH[i]}`,
    text: phInfo(short)[i]!,
    why: phWhy(short)[i],
    source: `${PH_SRC[i]} · VCFO Suite checklist, steps ${first}–${last}`,
    href,
    goLabel: 'Open this phase',
  };
}

/* ---------------- the hook ---------------- */

async function fetchExtras(): Promise<ClientIncorporationExtras | null> {
  const res = await fetch('/api/client/incorporation', { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`incorporation ${res.status}`);
  return ((await res.json()) as { incorporation: ClientIncorporationExtras }).incorporation;
}

export const INC_EXTRAS_KEY = ['client-portal', 'incorporation'] as const;

export interface IncData {
  model: PortalIncorporationModel;
  engagementId?: string;
  companyName: string;
  short: string;
  today: string;
  /** Real COI date (yyyy-mm-dd) once incorporated. */
  coiDate?: string;
  /** Manager-set incorporation window end. */
  coiExpected?: string;
  incorporated: boolean;
  extras?: ClientIncorporationExtras | null;
  leadName?: string;
  managerName?: string;
  identifiers: { cin?: string; pan?: string; tan?: string };
  certificate?: { storagePath: string; name: string };
  ownershipType?: import('@/data/engagements').OwnershipType;
  pending: boolean;
  noEngagement: boolean;
  requestsFor: (stepId: string) => ClientFileRequestDto[];
  refresh: () => void;
}

function shortCompany(name?: string): string {
  if (!name) return 'Your company';
  return companyShortName(name) || name;
}

export function useIncData(): IncData {
  const { shell } = usePortal();
  const { refreshEngagementChecklist, engagementsSettled } = useApp();
  const { model, engagement, loading } = usePortalIncorporation();
  const ov = useClientOverview();
  const extrasQ = useQuery({
    queryKey: INC_EXTRAS_KEY,
    queryFn: fetchExtras,
    enabled: Boolean(engagement),
    staleTime: 30_000,
  });
  const engId = engagement?.id;
  useEffect(() => {
    if (engId) void refreshEngagementChecklist(engId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engId]);

  const overview = ov.data?.overview ?? null;
  const today = todayIST();
  const coiDate = overview?.engagement.incorporationDate?.slice(0, 10) ?? engagement?.incorporationDate?.slice(0, 10) ?? model.byId['pre-12']?.doneOn;
  const requests = extrasQ.data?.fileRequests;
  const requestsFor = useMemo(() => {
    const by = new Map<string, ClientFileRequestDto[]>();
    for (const r of requests ?? []) by.set(r.stepId, [...(by.get(r.stepId) ?? []), r]);
    return (id: string) => by.get(id) ?? [];
  }, [requests]);
  const team = overview?.team ?? [];
  const cert = overview?.documents.deliverables.find((d) => d.kind === 'certificate');

  return {
    model,
    engagementId: engId,
    companyName: engagement?.companyName ?? overview?.engagement.companyName ?? '',
    short: shell?.companyShort || shortCompany(engagement?.companyName),
    today,
    coiDate,
    coiExpected: model.coiExpected,
    incorporated: Boolean(overview?.incorporated || coiDate),
    extras: extrasQ.data,
    leadName: team.find((t) => t.role === 'Project Lead')?.name,
    managerName: team.find((t) => t.role === 'Project Manager')?.name,
    identifiers: { cin: overview?.identifiers.cin, pan: overview?.identifiers.pan, tan: overview?.identifiers.tan },
    certificate: cert ? { storagePath: cert.storagePath, name: cert.name } : undefined,
    ownershipType: engagement?.ownershipType,
    pending: loading || (!engagement && !engagementsSettled) || (Boolean(engagement) && ov.isPending),
    noEngagement: !loading && engagementsSettled && !engagement,
    requestsFor,
    refresh: () => {
      if (engId) void refreshEngagementChecklist(engId);
      void extrasQ.refetch();
      void ov.refetch();
    },
  };
}

/** First name ("Arjun") for "requested by Arjun". */
export function firstName(n?: string): string {
  return (n ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Signed URL for a milestone document path (`/api/milestone-documents/signed-url`). */
export async function signedUrlFor(path: string): Promise<string> {
  const res = await fetch(`/api/milestone-documents/signed-url?path=${encodeURIComponent(path)}`);
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? 'Could not open the file');
  return body.url;
}

/**
 * D1 (owner, 2026-10-30): the client Incorporation page has no Registration section. This is
 * the step model without phase 4 (Registration), with the counts the page reads rebuilt from
 * the steps that are left. Registrations keep their own page.
 */
export function withoutRegistration(model: PortalIncorporationModel): PortalIncorporationModel {
  const phases = model.phases.filter((p) => p.no !== 4);
  if (phases.length === model.phases.length) return model;
  const steps = phases.flatMap((p) => p.steps);
  const done = steps.filter((s) => s.kind === 'done').length;
  const counts = { done: 0, you: 0, prog: 0, with: 0, next: 0, up: 0, late: 0 } as PortalIncorporationModel['counts'];
  for (const s of steps) {
    counts[s.kind] += 1;
    if (s.late) counts.late += 1;
  }
  const current = model.current && model.current.phaseNo !== 4 ? model.current : steps.find((s) => s.kind === 'you') ?? steps.find((s) => s.kind === 'prog' || s.kind === 'with');
  return {
    ...model,
    phases,
    steps,
    byId: Object.fromEntries(steps.map((s) => [s.id, s])),
    all: { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 },
    counts,
    current,
  };
}
