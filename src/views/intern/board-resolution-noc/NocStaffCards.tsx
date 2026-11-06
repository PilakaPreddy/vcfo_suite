'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import {
  DocTrack,
  EvidenceTable,
  ReceiveChecklist,
  VariantTree,
  VersionCompare,
  docDay,
  nocDocType,
  nocEvidence,
  type DocVersion,
} from '@/components/board-doc';
import { NOC_TEMPLATES } from '@/lib/noc/templates';
import { NOC_VARIANTS } from '@/lib/noc/variant';
import { NOC_FIELD_LABEL, NOC_VARIANT_FIELD } from '@/lib/noc/fields';
import type { NocState } from '@/lib/noc/state';
import { nocRecords, type NocAction, type NocVersionRow } from '@/views/intern/board-resolution-noc/useNocState';

/**
 * Staff parts of the board resolution (NOC) page (R-52, T1 to T6): the track with the notary
 * steps, the Template card (variant, internal file name, Change template, out-of-date mark,
 * Compare versions), the receive checklist and the "Why VCFO chose this template" evidence.
 * The shared document part (`@/components/board-doc`) draws the track, the checklist, the
 * compare list and the evidence table; this file only feeds them the real state.
 */

export function NocTrackStrip({ noc, nowLabel }: { noc: NocState; nowLabel?: string }) {
  const type = nocDocType(noc.variant, { notary: noc.foreignParent && !noc.notaryStepsOff });
  return <DocTrack stages={type.stages} records={nocRecords(noc)} nowLabel={nowLabel} label="Progress of the board resolution" />;
}

function CardHead({ title, meta, right }: { title: string; meta?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] min-w-0 items-center gap-2.5 border-b border-line-soft px-4 py-2 md:px-5">
      <CardHeadTile title={title} />
      <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
      {meta ? <span className="truncate text-[13px] text-ink-muted">{meta}</span> : null}
      {right ? <span className="ml-auto flex flex-none items-center">{right}</span> : null}
    </div>
  );
}

const VARIANT_OPTIONS = NOC_VARIANTS.map((v) => ({ value: v, label: NOC_TEMPLATES[v].label }));

/** T2, T3, T4: the Template card. */
export function NocTemplateCard({
  noc,
  busy,
  act,
  onMakeAgain,
  makingAgain,
  loadVersions,
  onError,
}: {
  noc: NocState;
  busy: NocAction['action'] | null;
  act: (body: NocAction) => Promise<NocState>;
  onMakeAgain: () => Promise<void> | void;
  makingAgain: boolean;
  loadVersions: () => Promise<NocVersionRow[]>;
  onError: (message: string) => void;
}) {
  const staff = noc.staff;
  const [changeOpen, setChangeOpen] = useState(false);
  const [variant, setVariant] = useState<string>(noc.variant);
  const [reason, setReason] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [versions, setVersions] = useState<DocVersion[] | null>(null);
  if (!staff) return null;
  const accepted = noc.accepted;

  const openCompare = async () => {
    setCompareOpen(true);
    try {
      const rows = await loadVersions();
      // The compare part reads oldest first; the route returns newest first.
      setVersions(
        [...rows].reverse().map((r) => ({
          id: String(r.version),
          label: `Version ${r.version}`,
          at: r.createdAt,
          by: r.byName ?? null,
          values: r.fields,
        })),
      );
    } catch (err) {
      setCompareOpen(false);
      onError(err instanceof Error ? err.message : 'Could not load the versions');
    }
  };

  const submitChange = async () => {
    try {
      await act({ action: 'change_template', variant, reason: reason.trim() });
      setChangeOpen(false);
      setReason('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not change the template');
    }
  };

  return (
    <section className="surface min-w-0 overflow-hidden" aria-label="Template">
      <CardHead
        title="Template"
        right={
          staff.canChangeTemplate && !accepted ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setVariant(noc.variant);
                setChangeOpen(true);
              }}
            >
              Change template
            </Button>
          ) : undefined
        }
      />
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 text-[14px] md:px-5">
        <dt className="text-[13px] text-ink-muted">Variant</dt>
        <dd className="min-w-0 font-medium text-ink">{noc.variantLabel}</dd>
        <dt className="text-[13px] text-ink-muted">File</dt>
        <dd className="min-w-0 truncate font-mono text-[12.5px] text-ink-2" title={staff.templateFileName}>
          {staff.templateFileName}
        </dd>
        {staff.override ? (
          <>
            <dt className="text-[13px] text-ink-muted">Changed</dt>
            <dd className="min-w-0 text-[13px] text-ink-2">
              {staff.override.byName ? `${staff.override.byName} · ` : ''}
              {docDay(staff.override.at)}
              {staff.override.reason ? ` · ${staff.override.reason}` : ''}
            </dd>
          </>
        ) : null}
        {noc.foreignParent ? (
          <>
            <dt className="text-[13px] text-ink-muted">Notary and apostille</dt>
            <dd className="flex items-center gap-2 text-[14px] text-ink">
              <Switch
                checked={!noc.notaryStepsOff}
                disabled={!staff.canChangeTemplate || accepted || busy === 'notary_steps'}
                aria-label="Notary and apostille steps"
                onCheckedChange={(on) => {
                  act({ action: 'notary_steps', off: !on }).catch((err) => onError(err instanceof Error ? err.message : 'Could not save'));
                }}
              />
              {noc.notaryStepsOff ? 'Off for this client' : 'On for this client'}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
        {staff.outOfDate ? (
          <>
            <span title={staff.outOfDate.changes.map((c) => `${c.label}: ${c.after || 'Not given yet'}`).join(', ')}>
              <Tag tone="warn">Answers changed after release</Tag>
            </span>
            <Button size="sm" disabled={makingAgain || accepted} onClick={() => void onMakeAgain()}>
              {makingAgain ? 'Making the draft…' : 'Make the draft again'}
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void openCompare()}>
          Compare versions
        </Button>
      </div>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change template</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <FilterSelect aria-label="Template" options={VARIANT_OPTIONS} value={variant} onChange={(e) => setVariant(e.target.value)} />
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              aria-label="Reason for the change"
              placeholder="Why does this project need another template?"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setChangeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!reason.trim() || variant === noc.variant || busy === 'change_template'} onClick={() => void submitChange()}>
              Change template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compare versions</DialogTitle>
          </DialogHeader>
          {versions ? (
            <VersionCompare versions={versions} labels={{ ...NOC_FIELD_LABEL, [NOC_VARIANT_FIELD]: 'Template' }} />
          ) : (
            <p className="text-[13px] text-ink-muted">Loading…</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** T5, T6: the receive checklist with Accept and Send back. */
export function NocReceiveCard({
  noc,
  busy,
  act,
  hasSignedCopy,
  onAccepted,
  onError,
}: {
  noc: NocState;
  busy: NocAction['action'] | null;
  act: (body: NocAction) => Promise<NocState>;
  hasSignedCopy: boolean;
  onAccepted: (next: NocState) => void;
  onError: (message: string) => void;
}) {
  const staff = noc.staff;
  if (!staff || !hasSignedCopy) return null;
  const accepted = noc.accepted;
  const acceptedStep = noc.track.find((s) => s.key === 'accepted');
  const run = (body: NocAction, then?: (n: NocState) => void) =>
    act(body)
      .then((n) => then?.(n))
      .catch((err) => onError(err instanceof Error ? err.message : 'Could not save'));

  return (
    <div className="grid gap-2">
      <ReceiveChecklist
        checks={staff.checks.map((c) => ({ key: c.key, label: c.label }))}
        ticked={staff.checks.filter((c) => c.ticked).map((c) => c.key)}
        onTick={(key, on) => void run({ action: 'check', key, ticked: on })}
        onAccept={() => void run({ action: 'accept' }, onAccepted)}
        onSendBack={(reason) => void run({ action: 'send_back', reason })}
        done={accepted}
        busy={busy !== null}
      />
      {noc.sentBack ? (
        <p className="m-0 text-[12.5px] text-ink-muted">
          Sent back{noc.sentBack.byName ? ` by ${noc.sentBack.byName}` : ''} · {docDay(noc.sentBack.at)} · {noc.sentBack.reason}
        </p>
      ) : null}
      {accepted ? (
        <p className="m-0 text-[12.5px] text-ink-muted">
          Accepted{acceptedStep?.byName ? ` by ${acceptedStep.byName}` : ''}
          {acceptedStep?.at ? ` · ${docDay(acceptedStep.at)}` : ''}
          {staff.vaultDocumentId ? ' · Filed in Documents › Vault' : ''}
        </p>
      ) : null}
    </div>
  );
}

/** C8 for staff: the full decision tree (D5, the same part the client sees) and the evidence behind the template. */
export function NocWhyCard({ noc, className }: { noc: NocState; className?: string }) {
  const ev = nocEvidence(noc.answers);
  const [replayKey, setReplayKey] = useState(0);
  const added = noc.foreignParent && !noc.notaryStepsOff;
  return (
    <section className={cn('surface min-w-0 overflow-hidden', className)} aria-label="Why VCFO chose this template">
      <CardHead
        title="Why VCFO chose this template"
        meta={`${ev.rows.length} project answers`}
        right={
          <Button variant="outline" size="sm" onClick={() => setReplayKey((k) => k + 1)} aria-label="Replay the chosen path">
            Replay
          </Button>
        }
      />
      <VariantTree answers={noc.answers} replayKey={replayKey} />
      <div className="p-4 pt-2 md:px-5">
        <EvidenceTable
          rows={ev.rows}
          result={noc.staff?.override ? <span>Changed by staff to {noc.variantLabel}</span> : undefined}
        />
        {added ? (
          <p className="m-0 mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
            This choice adds <Tag tone="prog">2 steps</Tag> <span className="text-ink-muted">Notarise · Apostille</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
