'use client';

/**
 * STEP PAGE — `/app/client/incorporation/step/[stepId]` (VCFO Spectrum, prototype
 * src/screens/client/StepScreen.tsx and step-parts.tsx): a plain page head (title, status
 * chip, meta line, owner and the official portal forms), underline tabs for the Answers and
 * Documents views, the ST5 list of the phase on the right, and the prev and next pager. The
 * approval row sits at the foot of the Answers card (it was a sticky bar). A step the client
 * fills in the direct flow keeps the shared form, the only place those answers can be entered.
 *
 * Real actions: client approve (`POST /api/client/steps/:id/approve`, deferred
 * until the 3.2 s Undo toast closes), request a change
 * (`POST /api/client/change-requests`), upload a requested file
 * (`POST /api/engagements/:id/milestone-documents` →
 * `POST /api/client/steps/:id/files`, with Undo), save a draft of the answers on a step the
 * client fills (`POST /api/client/steps/:id/draft`, C-218), and message the lead about a step
 * SBC holds (`POST /api/client/messages` with the step's item key, C-219).
 */
import { Check, CircleHelp, Download, ExternalLink, Eye, ListChecks, MessageSquare, PenLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getActiveCatalogItems, getChecklistStepTimelineLabel, type ChecklistField } from '@/data/checklist';
import { resolveChecklistItemFromStepParam } from '@/lib/slug';
import {
  extractItemResponses,
  fieldsForOwnership,
  getClientResponseFields,
  isStepRemarksField,
} from '@/lib/checklist/checklist-responses';
import { filterFieldsByViewer } from '@/lib/checklist/checklist-field-access';
import { applyShowWhen, expandRepeatFields, isRepeatField, repeatFieldLabel, resolveFieldLabels } from '@/lib/checklist/checklist-repeat';
import { withoutUnusedDirectorSlots } from '@/lib/incorporation/incorp-director-slots';
import { approvalStateOf, clientApproveBlockedReason, isAwaitingClientApproval } from '@/lib/checklist/checklist-step-approval';
import { isStepReleasedToClient } from '@/lib/checklist/checklist-visibility';
import { fileNameFromStoragePath, isMilestoneStoragePath, validateMilestoneUploadFile } from '@/lib/documents/milestone-document-storage';
import type { PortalStep } from '@/lib/client-portal/step-model';
import type { ClientFileRequestDto } from '@/lib/client-portal/incorporation-types';
import { canRoleEditField, isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';
import { itemKey } from '@/lib/work/item-key';
import { useApp } from '@/context/AppContext';
import { MilestoneResponseForm } from '@/views/incorporation/MilestoneResponseForm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { StepLink, StepMark } from '@/components/ui/step-track';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { FileBadge } from '@/components/ui/file-badge';
import { SkeletonRows } from '@/components/ui/empty-state';
import { portalHref } from '../../routes';
import { usePortal, usePortalCrumbs } from '../../PortalProvider';
import { useDocViewer, type ViewerDoc } from '../documents/DocViewer';
import { triggerDownload } from '../documents/file-types';
import { IncFrame, fmt, fmtL, istDay, kb } from './ui';
import {
  INC_EXTRAS_KEY,
  PHL,
  firstName,
  kd,
  ownKey,
  signedUrlFor,
  stepAnswer,
  stepHrefOf,
  tipTxt,
  useIncData,
  type IncData,
} from './data';
import { stepFiles } from './StepTable';
import { prefillNotes } from '@/lib/client-portal/step-progress';
import { portalFor } from './portals';
import { FieldArea, PortalModal } from './modal';
import { Col, Cols, Dot, DropZone, Empty, Island, ListRow, PageHead, Pager, SCard, markState, markTone, stepChip, useGo } from './spectrum';
import { formLabel } from '@/lib/ui/form-label';

/* ---------------- answers ---------------- */

interface Row {
  label: string;
  value: string;
  file?: string;
  /** "Copied from step n · …" when the answer was pre-filled from a knowable source (G-10). */
  note?: string;
  /** The checklist field behind a text answer (C-218: the client edits it on its own open step). */
  field?: ChecklistField;
  /** The stored answer (a select stores the option value, the row shows its label). */
  raw?: string;
}

/**
 * Read-only answer rows. Direct-flow steps show every field (client and lead
 * fill the same form); other SBC steps list what they capture from the item's
 * infoRequired (IN-11). File fields shown in the Documents card are left out (IN-04).
 */
function answerRows(s: PortalStep, ownershipType: IncData['ownershipType'], inDocs: Set<string>, notes: Record<string, string> = {}): Row[] {
  const responses = extractItemResponses(s.item, s.slice);
  const base = withoutUnusedDirectorSlots(
    s.item.id,
    filterFieldsByViewer(fieldsForOwnership(s.item.id, getClientResponseFields(s.item), ownershipType), 'client', s.item.id),
    responses,
  );
  const fields = resolveFieldLabels(applyShowWhen(expandRepeatFields(base, responses), responses), responses);
  const rows: Row[] = [];
  for (const f of fields as ChecklistField[]) {
    if (isRepeatField(f)) continue;
    const raw = String(responses[f.id] ?? '').trim();
    const label = repeatFieldLabel(base, responses, f.id) ?? f.label;
    if (f.type === 'file') {
      if (inDocs.has(f.id)) continue;
      // empty numbered slots ("Other attachment 1/2/3") read as one row
      const m = !raw ? /^(.*\S)\s+\d+$/.exec(label) : null;
      if (m) {
        const prev = rows.at(-1);
        if (prev && prev.value === '—' && (prev.label === `${m[1]}s` || prev.label === m[1])) {
          prev.label = `${m[1]}s`;
          continue;
        }
      }
      rows.push({ label: m ? m[1] : label, value: raw ? fileNameFromStoragePath(raw) : '—', file: raw && isMilestoneStoragePath(raw) ? raw : undefined, note: raw ? notes[f.id] : undefined });
      continue;
    }
    let v = raw;
    if (raw && (f.type === 'select' || f.type === 'segmented')) v = f.options?.find((o) => o.value === raw)?.label ?? raw;
    if (raw && f.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(raw)) v = fmtL(raw.slice(0, 10));
    rows.push({ label, value: v || '—', note: v ? notes[f.id] : undefined, field: f, raw });
  }
  if (!rows.some((r) => !/^remarks/i.test(r.label)) && s.owner !== 'client' && s.item.infoRequired.length) {
    const done = kd(s) === 'done';
    for (const q of s.item.infoRequired) {
      rows.splice(rows.length - (rows.length && /^remarks/i.test(rows.at(-1)!.label) ? 1 : 0), 0, {
        label: q.split(' — ')[0]!.replace(/\s*\((?:if any|attachment)\)\s*$/i, ''),
        value: done ? `Provided${s.doneOn ? ` · ${fmt(s.doneOn)}` : ''}` : '—',
      });
    }
  }
  if (!rows.some((r) => /^remarks/i.test(r.label))) rows.push({ label: 'Remarks (optional)', value: '—' });
  return rows;
}

/* ---------------- change-request dialog ---------------- */

/**
 * Request a change (C-225, prototype MessageModal): the Spectrum dialog, "Step n · title" above
 * the title, a labelled message field, Cancel and the main Send button (R-12).
 */
function ChangeDialog({
  about,
  to,
  heading = 'Request a change',
  placeholder = 'What should change?',
  onClose,
  onSend,
}: {
  about: string;
  to?: string;
  heading?: string;
  placeholder?: string;
  onClose: () => void;
  onSend: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await onSend(note.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request');
      setBusy(false);
    }
  };
  return (
    <PortalModal
      onClose={onClose}
      eyebrow={about}
      title={to ? `${heading} · ${to}` : heading}
      size="sm"
      initialFocus={ref}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!note.trim() || busy} onClick={() => void send()}>
            <MessageSquare size={16} strokeWidth={1.6} aria-hidden />
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <FieldArea label="Message" value={note} onChange={setNote} areaRef={ref} placeholder={placeholder} />
      {err ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {err}
        </p>
      ) : null}
    </PortalModal>
  );
}

/* ---------------- the page ---------------- */

const PHASE_PART: Record<number, string> = { 1: 'SPICe+ Part A', 2: 'SPICe+ Part B', 3: 'Post-incorporation', 4: 'Registration' };

export default function StepPage({ stepParam }: { stepParam: string }) {
  const d = useIncData();
  const { engagementsSettled } = useApp();
  const { go, openChat, toast } = usePortal();
  const goTo = useGo();
  const qc = useQueryClient();
  const viewer = useDocViewer();
  const item = useMemo(() => resolveChecklistItemFromStepParam(stepParam), [stepParam]);
  const s = item ? d.model.byId[item.id] : undefined;
  const phase = s ? d.model.phases[s.phaseNo - 1] : undefined;
  usePortalCrumbs(s ? ['Incorporation', PHASE_PART[s.phaseNo] ?? `Phase ${s.phaseNo}`, s.title] : ['Incorporation', 'Step']);
  const catalog = useMemo(() => getActiveCatalogItems(), []);
  const ci = s ? catalog.findIndex((c) => c.id === s.id) : -1;
  const prev = ci > 0 ? d.model.byId[catalog[ci - 1]!.id] : undefined;
  const next = ci >= 0 && ci < catalog.length - 1 ? d.model.byId[catalog[ci + 1]!.id] : undefined;
  const k = s ? kd(s) : 'up';
  const requests: ClientFileRequestDto[] = s ? d.requestsFor(s.id) : [];
  const openReqs = requests.filter((r) => !r.fulfilledAt);
  const files = s ? stepFiles(s, d.ownershipType) : [];
  const reqFields = new Set(requests.map((r) => r.fieldId));
  const otherFiles = files.filter((f) => !reqFields.has(f.fieldId));
  const awaiting = isAwaitingClientApproval(s?.slice);
  const meta = d.extras?.fileMeta ?? {};

  /* ---------- deferred approve with Undo (QUESTIONS: POST after the toast closes) ---------- */
  const [submitted, setSubmitted] = useState(false);
  const pendingApprove = useRef<{ timer: ReturnType<typeof setTimeout>; fire: () => void } | null>(null);
  const doApprove = useCallback(
    async (keepalive = false) => {
      if (!s || !d.engagementId) return;
      try {
        const res = await fetch(`/api/client/steps/${encodeURIComponent(s.id)}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engagementId: d.engagementId }),
          keepalive,
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; phaseApproved?: { title: string } | null };
        if (!res.ok) throw new Error(body.error ?? 'Could not approve this step');
        if (body.phaseApproved) toast(`That completes ${body.phaseApproved.title}. Your team has been told.`);
        d.refresh();
        void qc.invalidateQueries({ queryKey: ['client-overview'] });
      } catch (e) {
        setSubmitted(false);
        toast(e instanceof Error ? e.message : 'Could not approve this step');
      }
    },
    [s, d, qc, toast],
  );
  useEffect(
    () => () => {
      // leaving the page before the toast closes still submits (no silent loss)
      const p = pendingApprove.current;
      if (p) {
        clearTimeout(p.timer);
        p.fire();
      }
    },
    [],
  );

  /* ---------- NOC blocking: scroll to and focus the upload ---------- */
  const docsRef = useRef<HTMLElement>(null);
  /* Underline tabs (R-11, N4): the Answers and Documents views of this step. */
  const [view, setView] = useState('answers');
  const approve = () => {
    if (!s) return;
    if (openReqs.length) {
      const r = openReqs[0]!;
      toast(`Upload the ${r.label} first · it is still needed from ${d.short}`);
      // The upload zones live on the Documents view: switch to it, then point at the zone.
      setView('docs');
      requestAnimationFrame(() => {
        const drop = docsRef.current?.querySelector<HTMLElement>('.drop-zone');
        if (!drop) return;
        drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
        drop.classList.remove('pulse');
        void drop.offsetWidth;
        drop.classList.add('pulse');
        drop.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      });
      return;
    }
    if (!awaiting) {
      toast(clientApproveBlockedReason(s.slice) ?? 'This step is not waiting for your approval yet.');
      return;
    }
    setSubmitted(true);
    const fire = () => {
      pendingApprove.current = null;
      void doApprove(true);
    };
    const timer = setTimeout(fire, 3200);
    pendingApprove.current = { timer, fire };
    toast(`Approved & submitted · ${d.leadName ?? 'your project lead'} files it next`, {
      undo: () => {
        const p = pendingApprove.current;
        if (p) clearTimeout(p.timer);
        pendingApprove.current = null;
        setSubmitted(false);
      },
    });
  };

  /* ---------- request a change ---------- */
  const [changeOpen, setChangeOpen] = useState(false);
  const canChange = (() => {
    const st = approvalStateOf(s?.slice);
    return st === 'pending_client' || st === 'client_approved';
  })();
  const requestChange = () => {
    if (!s) return;
    if (canChange) setChangeOpen(true);
    else openChat(`I want to request a change to step ${s.n} · ${s.title}`);
  };
  const sendChange = async (note: string) => {
    if (!s || !d.engagementId) return;
    const res = await fetch('/api/client/change-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engagementId: d.engagementId, stepId: s.id, note }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? 'Could not send the request');
    setChangeOpen(false);
    toast(`Change request sent to ${d.managerName ?? d.leadName ?? 'your team'}`);
    d.refresh();
  };

  /* ---------- C-218: draft answers on a step the client fills ---------- */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = useState(false);
  const stepKey = s?.id;
  useEffect(() => setDraft({}), [stepKey]);
  const saveDraft = async () => {
    if (!s || !d.engagementId || !Object.keys(draft).length) return;
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/client/steps/${encodeURIComponent(s.id)}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagementId: d.engagementId, responses: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not save the draft');
      setDraft({});
      d.refresh();
      toast('Draft saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the draft');
    } finally {
      setSavingDraft(false);
    }
  };

  /* ---------- C-219: message the lead about a step SBC holds ---------- */
  const [msgOpen, setMsgOpen] = useState(false);
  const sendMessage = async (text: string) => {
    if (!s || !d.engagementId) return;
    const engId = d.extras?.engagementId ?? d.engagementId;
    const res = await fetch('/api/client/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engagementId: d.engagementId, body: text, itemKey: itemKey({ kind: 'step', engagementId: engId, stepId: s.id }) }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? 'Could not send the message');
    setMsgOpen(false);
    toast(`Sent to ${d.leadName ? firstName(d.leadName) : 'your team'}`);
  };

  /* ---------- upload a requested file (with Undo) ---------- */
  const [busyReq, setBusyReq] = useState<string | null>(null);
  const upload = async (r: ClientFileRequestDto, file: File) => {
    if (!s || !d.engagementId || !d.extras) return;
    const bad = validateMilestoneUploadFile(file);
    if (bad) {
      toast(bad);
      return;
    }
    setBusyReq(r.id);
    try {
      const fd = new FormData();
      fd.set('fieldId', r.fieldId);
      fd.set('stepId', s.id);
      fd.set('file', file);
      const up = await fetch(`/api/engagements/${encodeURIComponent(d.engagementId)}/milestone-documents`, { method: 'POST', body: fd });
      const ub = (await up.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!up.ok || !ub.path) throw new Error(ub.error ?? 'Upload failed');
      const at = await fetch(`/api/client/steps/${encodeURIComponent(s.id)}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagementId: d.extras.engagementId,
          requestId: r.id,
          path: ub.path,
          fileName: file.name,
          sizeBytes: file.size,
          contentType: file.type,
        }),
      });
      const ab = (await at.json().catch(() => ({}))) as { error?: string };
      if (!at.ok) throw new Error(ab.error ?? 'Could not attach the file');
      await qc.invalidateQueries({ queryKey: INC_EXTRAS_KEY });
      d.refresh();
      toast(`${r.label} uploaded · ${firstName(r.requestedByName) || 'your team'} will check it`, {
        undo: () => {
          void fetch(`/api/client/steps/${encodeURIComponent(s.id)}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engagementId: d.extras!.engagementId, requestId: r.id, undo: true }),
          }).then(() => {
            void qc.invalidateQueries({ queryKey: INC_EXTRAS_KEY });
            d.refresh();
          });
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyReq(null);
    }
  };

  /* ---------- file actions ---------- */
  const viewDocs = (): ViewerDoc[] =>
    files.map((f) => {
      const m = meta[f.path];
      return {
        id: `${s!.id}:${f.fieldId}`,
        name: f.fileName,
        url: () => signedUrlFor(f.path),
        meta: `Step ${s!.n} · ${s!.title}`,
        sizeBytes: m?.sizeBytes,
        contentType: m?.contentType,
        uploadedAt: m?.uploadedAt,
        uploadedBy: m?.uploadedByName,
      };
    });
  const preview = (path: string) => {
    const docs = viewDocs();
    const i = files.findIndex((f) => f.path === path);
    if (i >= 0) viewer.open(docs, i);
    else viewer.open([{ id: path, name: fileNameFromStoragePath(path), url: () => signedUrlFor(path) }], 0);
  };
  const download = async (path: string) => {
    try {
      triggerDownload(await signedUrlFor(path), fileNameFromStoragePath(path));
      toast(`Download started · ${fileNameFromStoragePath(path)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not download the file');
    }
  };

  if (!item) {
    return (
      <IncFrame pending={false} title="Step · Incorporation · VCFO Suite">
        <div className="wrap">
          <Island>
            <Empty
              action={
                <Button variant="secondary" onClick={() => go(portalHref('incorporation'))}>
                  All phases
                </Button>
              }
            >
              Step not found
            </Empty>
          </Island>
        </div>
      </IncFrame>
    );
  }
  if (!s || !phase) {
    return (
      <IncFrame pending title={`${item.title} · Incorporation · VCFO Suite`}>
        <div className="wrap">
          <Island className="grid grid-cols-1 gap-5">
            <span className="block h-14 w-1/2 animate-pulse rounded-md bg-surface-sunken" aria-hidden />
            <Cols>
              <SkeletonRows rows={8} />
              <SkeletonRows rows={6} />
            </Cols>
          </Island>
        </div>
      </IncFrame>
    );
  }

  // G-10: where pre-filled answers came from, and the step's sub-steps, both derived from the answers
  const notes = prefillNotes(s.id, Object.fromEntries(Object.values(d.model.byId).map((x) => [x.id, x.slice])));
  const rows = answerRows(s, d.ownershipType, new Set([...requests.map((r) => r.fieldId), ...otherFiles.map((f) => f.fieldId)]), notes);
  const released = k === 'done' || isStepReleasedToClient(s.slice, s.id);
  const phl = PHL[s.phaseNo - 1]!;
  const actItems = requests.length + 2;
  const actDone = requests.filter((r) => r.fulfilledAt).length + 1;
  const actPct = Math.round((actDone / actItems) * 100);
  const ans = stepAnswer(s, d.short);
  const docsCount = requests.length + otherFiles.length;
  const docsDone = requests.filter((r) => r.fulfilledAt).length + otherFiles.length;
  const chip = stepChip(s);
  const late = s.late && k !== 'done';
  const inPhase = phase.steps;
  const portalLink = s.n !== 2 ? portalFor(s.item) : null;
  const forms = (s.item.forms ?? []).slice(0, 3).map(formLabel);
  const showDocs = view === 'docs' && docsCount > 0;
  // C-218: the client edits text answers on a step it fills that is still open. The draft route
  // repeats every check; this only decides which rows draw an input.
  const direct = isDirectFlowStep(s.id);
  const editStep = !awaiting && released && ((s.owner === 'client' && (k === 'prog' || k === 'you')) || (direct && k !== 'done' && k !== 'up'));
  const unlocked = new Set(s.slice?.unlockedFields ?? []);
  const canEditRow = (r: Row) =>
    editStep &&
    !!r.field &&
    r.field.type !== 'file' &&
    (direct ? canRoleEditField('client', s.id, r.field.id) : (r.field.filledBy ?? s.item.responsibleRole) === 'client') &&
    (!s.slice?.locked || unlocked.has(r.field.id));
  const editable = rows.some(canEditRow);
  /**
   * The prototype's Answers and Documents views show every step the client reads. The shared
   * tabbed form stays for a direct-flow step the client is filling now, because repeating fields
   * and uploads can only be entered there; the client's actions sit under it.
   */
  const clientFormFields = filterFieldsByViewer(
    fieldsForOwnership(s.id, getClientResponseFields(s.item), d.ownershipType),
    'client',
    s.id,
  ).filter((f) => !isStepRemarksField(f));
  const leadLayout = Boolean(d.engagementId) && clientFormFields.length > 0 && direct && editStep;
  const reqDone = requests.filter((r) => r.fulfilledAt).length;
  const dirty = Object.keys(draft).length > 0;
  // C-219: a step SBC or MCA holds gets "Message <lead>" in the card foot.
  const leadFirst = d.leadName ? firstName(d.leadName) : '';

  const openPortal = (form: string) => {
    if (!portalLink) return;
    window.open(portalLink.url, '_blank', 'noopener,noreferrer');
    toast(`Opens ${form} on the official portal in a new tab`);
  };

  const fileRow = (key: string, name: string, path: string, chipTxt: string) => {
    const m = meta[path];
    const fname = fileNameFromStoragePath(path);
    const by = m?.uploadedByName ? firstName(m.uploadedByName) : undefined;
    const at = m?.uploadedAt ? fmt(istDay(m.uploadedAt)) : undefined;
    const small = [fname, kb(m?.sizeBytes), by, at].filter(Boolean).join(' · ');
    return (
      <ListRow key={key}>
        <FileBadge name={fname} />
        <span className="min-w-0 flex-1">
          <b className="block truncate font-medium text-ink">{name}</b>
          <span className="block truncate text-[12.5px] text-ink-muted">{small}</span>
        </span>
        <Chip tone={chipTxt === 'Checked' ? 'ok' : 'prog'} fixed className="hidden sm:inline-flex">
          {chipTxt}
        </Chip>
        <Button size="icon" variant="quiet" className="h-[30px] w-[30px] min-w-0" aria-label={`Preview ${name}`} onClick={() => preview(path)}>
          <Eye size={16} strokeWidth={1.6} aria-hidden />
        </Button>
        <Button size="icon" variant="quiet" className="h-[30px] w-[30px] min-w-0" aria-label={`Download ${fname}`} onClick={() => void download(path)}>
          <Download size={16} strokeWidth={1.6} aria-hidden />
        </Button>
      </ListRow>
    );
  };

  const cardOtherFiles = leadLayout ? [] : otherFiles;
  const cardDocsCount = requests.length + cardOtherFiles.length;
  const cardDocsDone = leadLayout ? reqDone : docsDone;
  const docsCard =
    cardDocsCount > 0 ? (
      <section ref={docsRef} id="docs" aria-label="Documents" className="min-w-0">
        <SCard
          title="Documents"
          flush
          right={
            requests.length ? (
              <Chip tone={cardDocsDone === cardDocsCount ? 'ok' : 'warn'}>{`${cardDocsDone} of ${cardDocsCount}`}</Chip>
            ) : (
              <span className="text-[13px] text-ink-muted">
                {cardDocsCount} file{cardDocsCount === 1 ? '' : 's'}
              </span>
            )
          }
        >
          {requests.map((r) => {
            const done = Boolean(r.fulfilledAt);
            const reqBy = r.requestedByName ? ` · requested by ${firstName(r.requestedByName)}` : '';
            const path = r.fulfilledPath ?? '';
            return (
              <div key={r.id} className="grid gap-2 border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
                <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
                  <StepMark state={done ? 'done' : 'now'} tone="warn" size={18} label={done ? 'Uploaded' : 'Asked'} />
                  <span className="truncate">{(r.note ?? r.label) + reqBy}</span>
                </div>
                {done && path ? (
                  <div className="-mx-4 md:-mx-5">{fileRow(r.id, r.label, path, k === 'done' ? 'Checked' : 'Uploaded')}</div>
                ) : (
                  <DropZone
                    label={r.label}
                    busy={busyReq === r.id}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                    chip={r.dueDate ? <Chip tone={r.dueDate < d.today ? 'bad' : 'warn'} className="hidden sm:inline-flex">{`Due ${fmt(r.dueDate)}`}</Chip> : undefined}
                    onFile={(f) => void upload(r, f)}
                  />
                )}
              </div>
            );
          })}
          {cardOtherFiles.map((f) => fileRow(f.fieldId, f.label, f.path, k === 'done' ? 'Checked' : 'Uploaded'))}
        </SCard>
      </section>
    ) : null;

  const approval = (
    <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-3 sm:flex-row sm:items-center md:px-5" role="region" aria-label="Approval">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <StepMark state={submitted ? 'done' : 'now'} tone="teal" label={submitted ? 'Approved' : 'Waiting'} />
        <span className="min-w-0">
          <b className="block truncate text-[14px] font-medium text-ink">{submitted ? `Approved by ${d.short}` : `Awaiting ${d.short}’s approval`}</b>
          <span className="mt-1 block h-1.5 w-[200px] max-w-full overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
            <i className={cn('block h-full rounded-bar', submitted ? 'bg-positive-mid' : 'bg-brand')} style={{ width: `${submitted ? 100 : Math.max(actPct, 6)}%` }} />
          </span>
        </span>
      </div>
      <div className="flex flex-none gap-2">
        <Button variant="secondary" className="max-sm:flex-1" onClick={requestChange}>
          <MessageSquare size={16} strokeWidth={1.6} aria-hidden />
          Request a change
        </Button>
        <Button
          className="max-sm:flex-1"
          disabled={submitted}
          onClick={approve}
          title={!awaiting && !openReqs.length ? clientApproveBlockedReason(s.slice) ?? undefined : undefined}
        >
          <Check size={16} strokeWidth={1.6} aria-hidden />
          {submitted ? 'Approved' : 'Approve'}
        </Button>
      </div>
    </div>
  );

  const stepForm = leadLayout ? (
    <div className="grid gap-3">
      <MilestoneResponseForm
        key={`${s.id}-${d.engagementId}`}
        item={s.item}
        clientId={d.engagementId!}
        engagementId={d.engagementId}
        variant="client"
        open={engagementsSettled}
        readOnly={!editStep}
        compactChrome
        sectionTabs
      />
      {requests.length > 0 ? docsCard : null}
      {k === 'you' ? <div className="overflow-hidden rounded-lg border border-line bg-surface">{approval}</div> : null}
      {k === 'with' && s.owner !== 'client' ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setMsgOpen(true)}>
            <MessageSquare size={16} strokeWidth={1.6} aria-hidden />
            {leadFirst ? `Message ${leadFirst}` : 'Message your team'}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  // The status line at the top of the Answers card (prototype step-parts.tsx statusLine).
  const stLine: { state: 'done' | 'now' | 'next'; title: string; sub: string; bad?: boolean } =
    k === 'done'
      ? {
          state: 'done',
          title: s.owner === 'client' ? 'Approved' : 'Completed',
          sub: `${s.owner === 'client' ? 'Accepted after submission on' : 'Delivered by SBC on'} ${s.doneOn ? fmtL(s.doneOn) : '-'}`,
        }
      : k === 'you'
        ? { state: 'now', title: `Waiting on ${d.short}${s.due ? ` · due ${fmt(s.due)}` : ''}`, sub: 'Check the answers, then approve and submit', bad: late }
        : k === 'prog'
          ? { state: 'now', title: `In progress${s.due ? ` · due ${fmt(s.due)}` : ''}`, sub: s.due ? `Fill the remaining answers and submit by ${fmt(s.due)}` : 'Fill the remaining answers and submit', bad: late }
          : k === 'with'
            ? { state: 'now', title: `With ${s.owner === 'mca' ? 'MCA' : 'SBC'}${s.due ? ` · due ${fmt(s.due)}` : ''}`, sub: s.owner === 'mca' ? 'MCA reviews the filing' : `${leadFirst || 'SBC'} is working on it` }
            : { state: 'next', title: 'Not started', sub: prev ? `Opens after step ${prev.n} · ${prev.title}` : 'Opens later' };

  const answersCard = (
    <SCard title={k === 'done' || k === 'you' ? 'Answers' : 'What this step captures'} flush>
      <div className="flex items-start gap-3 border-b border-line-soft px-4 py-3 md:px-5">
        <span className="mt-0.5 inline-grid">
          <StepMark state={stLine.state} tone={markTone(s)} label={chip.label} />
        </span>
        <span className="min-w-0 flex-1">
          <b className={cn('block text-[14px] font-medium text-ink', stLine.bad && 'text-danger')}>{stLine.title}</b>
          <span className="block text-[12.5px] text-ink-muted">{stLine.sub}</span>
        </span>
      </div>
      {s.item.description && !/\bintern\b/i.test(s.item.description) ? <p className="m-0 border-b border-line-soft px-4 py-3 text-[13.5px] text-ink-2 md:px-5">{s.item.description}</p> : null}
      <dl className="m-0">
        {rows.map((r, i) => (
          <KvRow
            key={`${r.label}-${i}`}
            r={released ? r : { label: r.label, value: '—' }}
            onFile={preview}
            edit={
              canEditRow(r)
                ? { value: draft[r.field!.id] ?? r.raw ?? '', onChange: (v) => setDraft((x) => ({ ...x, [r.field!.id]: v })) }
                : undefined
            }
          />
        ))}
      </dl>
      {editable ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          <Button variant="secondary" className="ml-auto" disabled={!dirty || savingDraft} onClick={() => void saveDraft()}>
            <PenLine size={16} strokeWidth={1.6} aria-hidden />
            {savingDraft ? 'Saving…' : 'Save draft'}
          </Button>
        </footer>
      ) : null}
      {k === 'you' ? approval : null}
      {k === 'with' && s.owner !== 'client' ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          <Button variant="secondary" className="ml-auto" onClick={() => setMsgOpen(true)}>
            <MessageSquare size={16} strokeWidth={1.6} aria-hidden />
            {leadFirst ? `Message ${leadFirst}` : 'Message your team'}
          </Button>
        </footer>
      ) : k === 'done' ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          <Button variant="secondary" className="ml-auto" onClick={requestChange}>
            <MessageSquare size={16} strokeWidth={1.6} aria-hidden />
            Request a change
          </Button>
        </footer>
      ) : k === 'up' && prev ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          <Button variant="secondary" className="ml-auto" onClick={() => go(stepHrefOf(prev))}>
            Go to step {prev.n}
          </Button>
        </footer>
      ) : null}
    </SCard>
  );

  const ownerTone = { client: 'text-warning', sbc: 'text-brand-text', mca: 'text-identity' } as const;
  const rail = (
    <SCard title={phl} meta={`${phase.done} / ${inPhase.length}`} headIcon={{ icon: ListChecks, tone: 'blue' }}>
      <ol className="m-0 flex list-none flex-col p-0">
        {inPhase.map((y, i) => {
          const cur = y.id === s.id;
          const ch = stepChip(y);
          const o = ownKey(y);
          return (
            <li key={y.id} className="relative flex items-center gap-1">
              <StepLink
                x={11}
                up={i > 0 && (kd(inPhase[i - 1]) === 'done' ? 'done' : 'todo')}
                down={i < inPhase.length - 1 && (kd(y) === 'done' ? 'done' : 'todo')}
              />
              <a
                href={stepHrefOf(y)}
                onClick={goTo(stepHrefOf(y))}
                aria-current={cur ? 'page' : undefined}
                aria-label={`Step ${y.n} · ${y.title}`}
                className={cn('relative -mx-2.5 flex min-h-[40px] min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-surface-sunken', cur && 'bg-surface-sunken')}
              >
                <span className="relative z-[1] inline-grid" data-tt={tipTxt(y)}>
                  <StepMark state={markState(y)} tone={markTone(y)} label={ch.label} />
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="flex-none font-mono text-[12px] font-normal text-ink-muted">Step {y.n}</span>
                  <span className={cn('truncate text-[14px] text-ink', cur ? 'font-medium' : 'font-normal')}>{y.title}</span>
                </span>
                <span className={cn('hidden flex-none text-[12px] font-medium sm:inline', ownerTone[y.owner])}>{o === 'You' ? d.short : o}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </SCard>
  );

  return (
    <IncFrame pending={d.pending} title={`${s.title} · Incorporation · VCFO Suite`}>
      <div className="wrap">
        <Island className="grid grid-cols-1 gap-5">
          <PageHead
            label={`Step ${s.n} · ${s.title}`}
            title={s.title}
            chips={<Chip tone={chip.tone}>{chip.label}</Chip>}
            meta={
              <>
                <span className="font-mono text-[12.5px] text-ink-2">Step {s.n}</span>
                <Dot />
                <span>
                  Phase {s.phaseNo} · {phase.name} · step {inPhase.indexOf(s) + 1} of {inPhase.length}
                </span>
                {s.doneOn || s.due ? (
                  <>
                    <Dot />
                    {k === 'done' ? <span>Done {fmt(s.doneOn)}</span> : <span className={cn(late && 'text-danger')}>Due {fmt(s.due)}</span>}
                  </>
                ) : null}
                {stepTimelineLabel(s) ? (
                  <>
                    <Dot />
                    <span>{stepTimelineLabel(s)}</span>
                  </>
                ) : null}
              </>
            }
            actions={
              <>
                <OwnerChip owner={s.owner === 'client' ? 'client' : s.owner === 'mca' ? 'mca' : 'sbc'} label={s.owner === 'client' ? d.short : undefined} />
                {portalLink
                  ? (forms.length ? forms : [portalLink.form]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => openPortal(f)}
                        className="inline-flex h-6 items-center gap-1.5 rounded-md border-1.5 border-line bg-surface-raised px-2 font-mono text-[12px] font-medium text-ink-2 hover:bg-surface-sunken"
                        aria-label={`Open ${f} on the official portal`}
                      >
                        {f}
                        <ExternalLink size={12} strokeWidth={1.6} aria-hidden />
                      </button>
                    ))
                  : null}
                <Button variant="quiet" size="sm" aria-label={`What’s this? ${s.title}`} onClick={() => openChat(`What’s this: ${s.title}?`, ans)}>
                  <CircleHelp size={15} strokeWidth={1.6} aria-hidden />
                  What’s this?
                </Button>
              </>
            }
          />
          <Cols>
            <Col>
              {stepForm ?? (docsCount > 0 ? (
                <SpectrumTabs
                  variant="underline"
                  label="Views of this step"
                  items={[
                    { key: 'answers', label: 'Answers', count: rows.length },
                    { key: 'docs', label: 'Documents', count: `${docsDone}/${docsCount}` },
                  ]}
                  value={view}
                  onChange={setView}
                />
              ) : null)}
              {stepForm ? null : showDocs ? docsCard : answersCard}
            </Col>
            <Col>{rail}</Col>
          </Cols>
          <Pager
            prev={prev ? { href: stepHrefOf(prev), label: `${prev.n} · ${prev.title}` } : { href: portalHref('incorporation'), label: 'All phases' }}
            next={next ? { href: stepHrefOf(next), label: `${next.n} · ${next.title}` } : { href: portalHref('incorporation'), label: 'All phases' }}
          />
        </Island>
      </div>
      {changeOpen ? <ChangeDialog about={`Step ${s.n} · ${s.title}`} to={d.leadName ? firstName(d.leadName) : undefined} onClose={() => setChangeOpen(false)} onSend={sendChange} /> : null}
      {msgOpen ? (
        <ChangeDialog
          about={`Step ${s.n} · ${s.title}`}
          to={leadFirst || undefined}
          heading="Message"
          placeholder={leadFirst ? `Write to ${leadFirst}` : 'Write to your team'}
          onClose={() => setMsgOpen(false)}
          onSend={sendMessage}
        />
      ) : null}
      {viewer.node}
    </IncFrame>
  );
}

function stepTimelineLabel(s: PortalStep): string {
  return getChecklistStepTimelineLabel(s.item);
}

function KvRow({ r, onFile, edit }: { r: Row; onFile: (path: string) => void; edit?: { value: string; onChange: (v: string) => void } }) {
  const no = r.value === '—';
  if (edit && r.field) {
    const f = r.field;
    const opts = f.type === 'select' || f.type === 'segmented' ? (f.options ?? []) : null;
    return (
      <div className="grid gap-1 border-t border-line-soft px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center sm:gap-4 md:px-5">
        <dt className="min-w-0 text-[13px] text-ink-muted">
          {r.label}
          {r.note ? <small className="block text-[12px] text-ink-faint">{r.note}</small> : null}
        </dt>
        <dd className="m-0 min-w-0">
          {opts ? (
            <select
              value={edit.value}
              onChange={(e) => edit.onChange(e.target.value)}
              aria-label={r.label}
              className="box-border h-10 w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
            >
              <option value="">—</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input type={f.type === 'date' ? 'date' : 'text'} value={f.type === 'date' ? edit.value.slice(0, 10) : edit.value} onChange={(e) => edit.onChange(e.target.value)} aria-label={r.label} />
          )}
        </dd>
      </div>
    );
  }
  return (
    <div className="grid gap-1 border-t border-line-soft px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4 md:px-5">
      <dt className="min-w-0 text-[13px] text-ink-muted">
        {r.label}
        {r.note ? <small className="block text-[12px] text-ink-faint">{r.note}</small> : null}
      </dt>
      <dd className={cn('m-0 min-w-0 text-[13.5px] font-medium', no ? 'text-ink-faint' : r.value.startsWith('Provided') ? 'text-positive' : 'text-ink')}>
        {r.file ? (
          <button type="button" className="inline-flex items-center gap-1.5 text-left font-medium text-brand-text hover:underline" aria-label={`Open ${r.value}`} onClick={() => onFile(r.file!)}>
            <ExternalLink size={14} strokeWidth={1.6} aria-hidden />
            {r.value}
          </button>
        ) : r.value.startsWith('Provided') ? (
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} strokeWidth={2} aria-hidden /> {r.value}
          </span>
        ) : (
          r.value
        )}
      </dd>
    </div>
  );
}
