'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Textarea } from '@/components/ui/textarea';
import { filingPacketUrl, openFilingDocument, useAssistAttachments, useMcaFiling, useMcaFilingActions } from '@/hooks/use-mca-filing';
import {
  FILING_FORMS,
  FILING_FORM_LABEL,
  FILING_STATE_LABEL,
  istDate,
  type FilingDeadline,
  type FilingForm,
  type FilingState,
} from '@/lib/mca-filing/filing-state';
import { REMARK_CAUSES, REMARK_CAUSE_INFO, isRemarkCause, type PacketPart, type SignerReadiness } from '@/lib/mca-filing/readiness';
import type { KnownSigner, SignedPdfCheck, SignerMatch } from '@/lib/mca-filing/signers';
import type { AssistAttachmentItem, FilingBundle, FilingDocumentDto, FilingDto, PortalPdfCheck } from '@/lib/mca-filing/types';

const STATE_TONE: Partial<Record<FilingState, ChipTone>> = {
  data_ready: 'idle',
  approved: 'ok',
  submitted: 'teal',
  part_a_submitted: 'teal',
  awaiting_signatures: 'teal',
  payment_pending: 'teal',
  upload_pending: 'teal',
  resubmit: 'bad',
  cancelled: 'idle',
  name_approved: 'ok',
  signed_ready: 'ok',
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

const message = (e: unknown) => (e instanceof Error ? e.message : 'The request failed.');

function Block({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0 md:px-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h4 className="text-[13px] font-medium text-ink">{title}</h4>
        {meta ? <span className="text-[12.5px] text-ink-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function deadlineTone(d: FilingDeadline): ChipTone {
  if (d.daysLeft < 0) return 'bad';
  if (d.daysLeft <= 3) return 'warn';
  return 'idle';
}

function deadlineWords(d: FilingDeadline): string {
  if (d.daysLeft < 0) return `${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} late`;
  if (d.daysLeft === 0) return 'Due today';
  return `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`;
}

function Deadlines({ filing }: { filing: FilingDto }) {
  if (filing.deadlines.length === 0) return null;
  return (
    <Block title="Deadlines">
      <ul className="space-y-1.5">
        {filing.deadlines.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <Chip tone={deadlineTone(d)} raw>
              {deadlineWords(d)}
            </Chip>
            <span>
              {d.label} by {fmt(`${d.dueOn}T12:00:00+05:30`)}
            </span>
            <span className="text-ink-muted">{d.source}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

const PART_LABEL: Record<PacketPart, string> = {
  profile: 'form values',
  attachments: 'attachment list',
  signers: 'signers',
  missing: 'missing values',
};

/** One verdict per form from the server: blockers stop the filing, warnings are read first. */
function Verdict({ bundle, form }: { bundle: FilingBundle; form: FilingForm }) {
  const verdict = bundle.readiness?.[form];
  if (!verdict) return null;
  return (
    <Block
      title="Ready to file"
      meta={
        <Chip tone={verdict.ready ? 'ok' : 'bad'} raw>
          {verdict.ready ? 'Ready' : `${verdict.blockers.length} to fix`}
        </Chip>
      }
    >
      {verdict.blockers.length === 0 && verdict.warnings.length === 0 && verdict.checks.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Nothing that Suite can check stops this form. Check the rest by hand on the portal.</p>
      ) : null}
      {verdict.blockers.length ? (
        <ul className="space-y-1 text-[13px] text-danger">
          {verdict.blockers.map((b) => (
            <li key={`${b.group}-${b.text}`}>{b.text}</li>
          ))}
        </ul>
      ) : null}
      {verdict.warnings.length ? (
        <ul className="mt-1.5 space-y-1 text-[13px] text-warning">
          {verdict.warnings.map((w) => (
            <li key={`${w.group}-${w.text}`}>{w.text}</li>
          ))}
        </ul>
      ) : null}
      {verdict.checks.length ? (
        <div className="mt-2.5">
          <p className="text-[12.5px] text-ink-muted">MCA raised these causes more than once in the last 12 months. Check them before you file.</p>
          <ul className="mt-1 space-y-1 text-[13px] text-ink">
            {verdict.checks.map((c) => (
              <li key={c.cause}>
                <span className="font-medium">{c.label}</span> <span className="text-ink-muted">({c.count} times):</span> {c.check}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Block>
  );
}

/** The frozen filing packet: one numbered copy of the data the forms are filled from. */
function Packet({ bundle }: { bundle: FilingBundle }) {
  const actions = useMcaFilingActions(bundle.engagementId);
  const [note, setNote] = useState('');
  const packet = bundle.packet;
  if (!packet) return null;
  const latest = packet.latest;
  return (
    <Block title="Filing packet" meta={latest ? `Packet ${latest.version}, ${fmt(latest.createdAt)}` : 'Not frozen yet'}>
      {latest ? (
        <div className="space-y-1 text-[13px]">
          <p className="flex flex-wrap items-center gap-2">
            <a href={filingPacketUrl(bundle.engagementId, latest.version)} className="font-medium text-brand-text hover:underline" download>
              Download packet {latest.version}
            </a>
            <span className="text-ink-muted">
              Frozen by {latest.createdBy ?? 'a person no longer on the team'}
              {latest.note ? `. Note: ${latest.note}` : ''}
            </span>
          </p>
          {packet.changed.length ? (
            <p className="text-warning">Changed since packet {latest.version}: {packet.changed.map((p) => PART_LABEL[p]).join(', ')}.</p>
          ) : (
            <p className="text-ink-muted">The data in Suite is the same as packet {latest.version}.</p>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">Freeze the packet before anyone fills the portal, so a later edit shows up here.</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" aria-label="Packet note" className="h-control-sm min-w-[200px] flex-1 text-[13px]" />
        <Button
          size="sm"
          variant="outline"
          disabled={actions.freezePacket.isPending || (Boolean(latest) && packet.changed.length === 0)}
          onClick={() =>
            actions.freezePacket.mutate(
              { ...(note.trim() ? { note: note.trim() } : {}) },
              {
                onSuccess: (out) => {
                  setNote('');
                  toast.success(out.created ? `Packet ${out.packet.version} frozen` : `No change since packet ${out.packet.version}`);
                },
                onError: (e) => toast.error(message(e)),
              },
            )
          }
        >
          {latest ? 'Freeze a new packet' : 'Freeze the packet'}
        </Button>
      </div>
    </Block>
  );
}

function Readiness({ bundle, form, attachments, loading }: { bundle: FilingBundle; form: FilingForm; attachments: AssistAttachmentItem[] | undefined; loading: boolean }) {
  const columns: EFilingColumn<AssistAttachmentItem>[] = [
    { key: 'label', header: 'Document', render: (row) => <span className="text-ink">{row.label}</span> },
    { key: 'file', header: 'File in Suite', width: '30%', render: (row) => <span className="text-ink-muted">{row.available ? row.fileName : (row.note ?? 'Not stored')}</span> },
    {
      key: 'available',
      header: 'For Assist',
      width: '124px',
      render: (row) => (
        <Chip tone={row.available ? 'ok' : 'idle'} raw fixed>
          {row.available ? 'Available' : 'Not stored'}
        </Chip>
      ),
    },
  ];
  const available = attachments?.filter((a) => a.available).length ?? 0;
  return (
    <>
      <Block title="Values" meta={bundle.missing.length ? `${bundle.missing.length} missing` : 'Nothing missing'}>
        {bundle.missing.length ? (
          <ul className="grid gap-x-6 gap-y-1 text-[13px] text-ink-muted sm:grid-cols-2">
            {bundle.missing.slice(0, 12).map((m) => (
              <li key={m.key}>{m.label}</li>
            ))}
            {bundle.missing.length > 12 ? <li>and {bundle.missing.length - 12} more</li> : null}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted">Suite holds every value the form needs.</p>
        )}
      </Block>
      {form === 'spice-part-b' ? (
        <Block title="Attachments" meta={attachments ? `${available} of ${attachments.length} files available` : undefined}>
          {loading ? (
            <p className="text-[13px] text-ink-muted">Checking storage.</p>
          ) : (
            <div className="-mx-4 md:-mx-5">
              <EFilingGrid caption="Attachment files" columns={columns} rows={attachments ?? []} rowKey={(row) => row.key} pageSize={8} empty="No attachments." />
            </div>
          )}
        </Block>
      ) : null}
    </>
  );
}

function dscWords(s: KnownSigner, today: string): { text: string; tone: ChipTone } {
  if (s.hasDsc === false) return { text: 'No DSC', tone: 'bad' };
  if (s.dscExpiry) {
    const when = /^\d{4}-\d{2}-\d{2}/.test(s.dscExpiry) ? s.dscExpiry.slice(0, 10) : null;
    if (when && when < today) return { text: `Expired ${s.dscExpiry}`, tone: 'bad' };
    return { text: `Expiry ${s.dscExpiry}`, tone: 'idle' };
  }
  return { text: s.hasDsc ? 'Held, no expiry on record' : 'Not on record', tone: 'idle' };
}

const OUTCOME: Record<string, string> = {
  sent: 'Asked',
  no_email: 'No email on record',
  not_configured: 'Email is not set up',
  failed: 'Email failed',
};

function Signers({ bundle, filing, signed }: { bundle: FilingBundle; filing: FilingDto; signed: FilingDocumentDto | undefined }) {
  const actions = useMcaFilingActions(bundle.engagementId);
  const today = istDate(new Date());
  const signedIds = new Set((signed?.signers ?? []).map((m) => m.matchedSignerId).filter(Boolean));
  const lastAsk = (id: string) => [...filing.signatureRequests].reverse().find((r) => r.signerId === id);
  const checks = new Map((bundle.signerChecks ?? []).map((c) => [c.signerId, c]));
  const columns: EFilingColumn<KnownSigner>[] = [
    { key: 'name', header: 'Signer', render: (s) => <span className="text-ink">{s.name}</span> },
    {
      key: 'dsc',
      header: 'DSC in Suite',
      width: '22%',
      render: (s) => {
        const d = dscWords(s, today);
        return d.tone === 'bad' ? <Chip tone="bad" raw>{d.text}</Chip> : <span className="text-ink-muted">{d.text}</span>;
      },
    },
    {
      key: 'ready',
      header: 'Ready to sign',
      width: '24%',
      render: (s) => {
        const c = checks.get(s.id);
        if (!c) return <span className="text-ink-muted">Not checked</span>;
        const gaps = c.items.filter((i) => !i.ok);
        return gaps.length === 0 ? (
          <Chip tone="ok" raw fixed>
            Ready
          </Chip>
        ) : (
          <span className="text-[12.5px] text-ink-muted">{gaps.map((g) => g.text).join(' ')}</span>
        );
      },
    },
    {
      key: 'asked',
      header: 'Asked',
      width: '18%',
      render: (s) => {
        const a = lastAsk(s.id);
        return <span className="text-ink-muted">{a ? `${OUTCOME[a.outcome]}${a.outcome === 'sent' ? ` ${fmt(a.at)}` : ''}` : 'Not yet'}</span>;
      },
    },
    {
      key: 'signed',
      header: 'Signature',
      width: '112px',
      render: (s) => (
        <Chip tone={signedIds.has(s.id) ? 'ok' : 'idle'} raw fixed>
          {signedIds.has(s.id) ? 'Signed' : 'Waiting'}
        </Chip>
      ),
    },
  ];
  const canAsk = Boolean(filing.reviewedAt) && bundle.signers.length > 0;
  return (
    <Block
      title="Signers"
      meta={bundle.signers.length ? `${signedIds.size} of ${bundle.signers.length} signed` : undefined}
    >
      {bundle.signers.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Suite holds no director or subscriber for this company yet.</p>
      ) : (
        <div className="-mx-4 md:-mx-5">
          <EFilingGrid caption="Signers" columns={columns} rows={bundle.signers} rowKey={(s) => s.id} pageSize={10} empty="No signers." />
        </div>
      )}
      {bundle.signers.length ? <SignerFacts engagementId={bundle.engagementId} checks={bundle.signerChecks ?? []} /> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={!canAsk || actions.askSignatures.isPending}
          onClick={() =>
            actions.askSignatures.mutate(
              { form: filing.form },
              {
                onSuccess: (out) => {
                  const sent = out.requests.filter((r) => r.outcome === 'sent').length;
                  toast.success(`${sent} of ${out.requests.length} signers emailed`);
                },
                onError: (e) => toast.error(message(e)),
              },
            )
          }
        >
          Email the PDF to signers
        </Button>
        <span className="text-[12.5px] text-ink-muted">{filing.reviewedAt ? 'Each signer gets a separate email. Nothing goes out until you press this.' : 'Available after the professional approves the PDF.'}</span>
      </div>
    </Block>
  );
}

/**
 * Business User registration and DSC association happen on the portal, each with the signer's
 * own OTP or PIN. Suite cannot read them, so a person records the date they confirmed each one.
 */
function SignerFacts({ engagementId, checks }: { engagementId: string; checks: SignerReadiness[] }) {
  const actions = useMcaFilingActions(engagementId);
  const id = useId();
  const [signerId, setSignerId] = useState('');
  const [businessUserOn, setBusinessUserOn] = useState('');
  const [dscAssociatedOn, setDscAssociatedOn] = useState('');
  const pick = (next: string) => {
    setSignerId(next);
    const c = checks.find((x) => x.signerId === next);
    setBusinessUserOn(c?.portal.businessUserOn ?? '');
    setDscAssociatedOn(c?.portal.dscAssociatedOn ?? '');
  };
  const today = istDate(new Date());
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div className="grid gap-1 text-[12.5px] text-ink-muted">
        <label htmlFor={`${id}-signer`}>Confirm MCA set-up for</label>
        <FilterSelect id={`${id}-signer`} value={signerId} onChange={(e) => pick(e.target.value)} options={[{ value: '', label: 'Pick a signer' }, ...checks.map((c) => ({ value: c.signerId, label: c.name }))]} />
      </div>
      <div className="grid gap-1 text-[12.5px] text-ink-muted">
        <label htmlFor={`${id}-bu`}>Business User since</label>
        <Input id={`${id}-bu`} type="date" max={today} value={businessUserOn} disabled={!signerId} onChange={(e) => setBusinessUserOn(e.target.value)} className="h-control-sm w-40 text-[13px]" />
      </div>
      <div className="grid gap-1 text-[12.5px] text-ink-muted">
        <label htmlFor={`${id}-dsc`}>DSC associated on</label>
        <Input id={`${id}-dsc`} type="date" max={today} value={dscAssociatedOn} disabled={!signerId} onChange={(e) => setDscAssociatedOn(e.target.value)} className="h-control-sm w-40 text-[13px]" />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!signerId || actions.signerFacts.isPending}
        onClick={() =>
          actions.signerFacts.mutate(
            { signerId, businessUserOn: businessUserOn || null, dscAssociatedOn: dscAssociatedOn || null },
            { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(message(e)) },
          )
        }
      >
        Save
      </Button>
    </div>
  );
}

function UploadButton({ label, onFile, disabled }: { label: string; onFile: (file: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

function OpenLink({ engagementId, doc }: { engagementId: string; doc: FilingDocumentDto }) {
  return (
    <button
      type="button"
      className="text-[13px] font-medium text-brand-text hover:underline"
      onClick={() => openFilingDocument(engagementId, doc.id).catch((e) => toast.error(message(e)))}
    >
      {doc.fileName}
    </button>
  );
}

function PortalResult({ doc, engagementId }: { doc: FilingDocumentDto; engagementId: string }) {
  const check = doc.check as PortalPdfCheck;
  return (
    <div className="space-y-1.5 text-[13px]">
      <p className="flex flex-wrap items-center gap-2">
        <OpenLink engagementId={engagementId} doc={doc} />
        <span className="text-ink-muted">{fmt(doc.createdAt)}</span>
      </p>
      {check.unreadable ? (
        <p className="text-danger">The text of this PDF cannot be read, so nothing was compared. It is not a pass. Read it by hand.</p>
      ) : (
        <p className={check.missing?.length ? 'text-warning' : 'text-ink-muted'}>
          {check.found} of {check.checked} values found in the PDF.
        </p>
      )}
      {!check.unreadable && check.missing?.length ? (
        <ul className="space-y-0.5 text-ink-muted">
          {check.missing.slice(0, 20).map((m) => (
            <li key={`${m.field}-${m.expected}`}>
              Not found: <span className="font-mono text-[12px]">{m.field}</span> {m.expected}
            </li>
          ))}
          {check.missing.length > 20 ? <li>and {check.missing.length - 20} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function signatureLine(m: SignerMatch): string {
  const who = m.matchedAs ? ` (${m.matchedAs})` : ' (name not on this filing, check by hand)';
  const valid = m.validFrom && m.validTo ? `, certificate ${fmt(m.validFrom)} to ${fmt(m.validTo)}` : '';
  return `${m.signerName ?? 'Unknown signer'}${who}${valid}`;
}

function SignedResult({ doc, engagementId }: { doc: FilingDocumentDto; engagementId: string }) {
  const check = doc.check as SignedPdfCheck;
  return (
    <div className="space-y-1 text-[13px]">
      <p className="flex flex-wrap items-center gap-2">
        <OpenLink engagementId={engagementId} doc={doc} />
        <span className="text-ink-muted">{fmt(doc.createdAt)}</span>
        {doc.stale ? (
          <Chip tone="warn" raw>
            Portal PDF changed
          </Chip>
        ) : null}
      </p>
      <ul className="space-y-0.5 text-ink-muted">
        {doc.signers.map((m) => (
          <li key={m.index}>{signatureLine(m)}</li>
        ))}
      </ul>
      {check.missingSigners?.length ? <p className="text-ink-muted">Still to sign: {check.missingSigners.map((s) => s.name).join(', ')}</p> : null}
    </div>
  );
}

function Pdfs({ bundle, filing, portal, signed }: { bundle: FilingBundle; filing: FilingDto; portal: FilingDocumentDto | undefined; signed: FilingDocumentDto[] }) {
  const actions = useMcaFilingActions(bundle.engagementId);
  const [refusal, setRefusal] = useState<string | null>(null);
  const add = (kind: 'portal_pdf' | 'signed_pdf') => (file: File) => {
    setRefusal(null);
    actions.upload.mutate(
      { form: filing.form, kind, file },
      {
        onSuccess: () => toast.success(kind === 'portal_pdf' ? 'Portal PDF added' : 'Signed PDF added'),
        onError: (e) => setRefusal(message(e)),
      },
    );
  };
  return (
    <Block title="PDFs">
      <div className="mb-3 flex flex-wrap gap-2">
        <UploadButton label="Add portal PDF" onFile={add('portal_pdf')} disabled={actions.upload.isPending} />
        {filing.form === 'spice-part-b' ? <UploadButton label="Add signed PDF" onFile={add('signed_pdf')} disabled={actions.upload.isPending || !portal} /> : null}
      </div>
      {refusal ? (
        <p role="alert" className="mb-3 text-[13px] text-danger">
          {refusal}
        </p>
      ) : null}
      {portal ? <PortalResult doc={portal} engagementId={bundle.engagementId} /> : <p className="text-[13px] text-ink-muted">No portal PDF yet.</p>}
      {signed.length ? (
        <div className="mt-3 space-y-3">
          {signed.slice(0, 3).map((doc) => (
            <SignedResult key={doc.id} doc={doc} engagementId={bundle.engagementId} />
          ))}
          <p className="text-[12.5px] text-ink-muted">Suite checks that the file was not changed and that each signature matches its certificate. It does not check the chain to the CCA root. The MCA portal does that on upload.</p>
        </div>
      ) : null}
    </Block>
  );
}

function Approval({ engagementId, filing, portal }: { engagementId: string; filing: FilingDto; portal: FilingDocumentDto | undefined }) {
  const actions = useMcaFilingActions(engagementId);
  const [note, setNote] = useState('');
  const check = portal?.check as PortalPdfCheck | undefined;
  const needsNote = Boolean(check) && (check!.unreadable || (check!.missing?.length ?? 0) > 0 || !check!.checked);
  return (
    <Block title="Professional approval">
      {filing.reviewedAt ? (
        <p className="text-[13px] text-ink">
          Approved by {filing.reviewedBy ?? 'a person no longer on the team'} on {fmt(filing.reviewedAt)}.{filing.reviewNote ? <span className="text-ink-muted"> Note: {filing.reviewNote}</span> : null}
        </p>
      ) : !portal ? (
        <p className="text-[13px] text-ink-muted">Add the portal PDF first.</p>
      ) : (
        <div className="space-y-2">
          {needsNote ? (
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Why you approve it with values missing" aria-label="Approval note" className="text-[13px]" />
          ) : null}
          <Button
            size="sm"
            disabled={actions.review.isPending || (needsNote && !note.trim())}
            onClick={() =>
              actions.review.mutate(
                { form: filing.form, ...(note.trim() ? { note: note.trim() } : {}) },
                { onSuccess: () => toast.success('Approval recorded'), onError: (e) => toast.error(message(e)) },
              )
            }
          >
            Record my approval
          </Button>
        </div>
      )}
    </Block>
  );
}

function References({ engagementId, filing }: { engagementId: string; filing: FilingDto }) {
  const actions = useMcaFilingActions(engagementId);
  const [srn, setSrn] = useState('');
  const [srnOn, setSrnOn] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const id = useId();
  const save = (patch: Record<string, string>, done: () => void) =>
    actions.patch.mutate({ form: filing.form, ...patch }, { onSuccess: () => { done(); toast.success('Saved'); }, onError: (e) => toast.error(message(e)) });
  return (
    <Block title="Portal references" meta={filing.srn ? `SRN ${filing.srn}, ${fmt(filing.srnAt)}` : undefined}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1 text-[12.5px] text-ink-muted">
          <label htmlFor={`${id}-srn`}>SRN</label>
          <Input id={`${id}-srn`} value={srn} onChange={(e) => setSrn(e.target.value)} className="h-control-sm w-40 font-mono text-[13px]" maxLength={20} />
        </div>
        <div className="grid gap-1 text-[12.5px] text-ink-muted">
          <label htmlFor={`${id}-srn-on`}>SRN date</label>
          <Input id={`${id}-srn-on`} type="date" value={srnOn} onChange={(e) => setSrnOn(e.target.value)} className="h-control-sm w-40 text-[13px]" />
        </div>
        <Button size="sm" variant="outline" disabled={!srn.trim() || actions.patch.isPending} onClick={() => save({ srn: srn.trim(), ...(srnOn ? { srnOn } : {}) }, () => { setSrn(''); setSrnOn(''); })}>
          Save SRN
        </Button>
        {filing.form === 'spice-part-b' ? (
          <>
            <div className="ml-0 grid gap-1 text-[12.5px] text-ink-muted sm:ml-4">
              <label htmlFor={`${id}-paid-on`}>Fee paid on</label>
              <Input id={`${id}-paid-on`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-control-sm w-40 text-[13px]" />
            </div>
            <Button size="sm" variant="outline" disabled={!paidOn || actions.patch.isPending} onClick={() => save({ paidOn }, () => setPaidOn(''))}>
              Save payment
            </Button>
          </>
        ) : null}
      </div>
      {filing.paidAt ? <p className="mt-2 text-[13px] text-ink-muted">Fee paid on {fmt(filing.paidAt)}.</p> : null}
      {filing.signedUploadedAt ? <p className="mt-1 text-[13px] text-ink-muted">Signed form uploaded on {fmt(filing.signedUploadedAt)}.</p> : null}
    </Block>
  );
}

function Remarks({ engagementId, filing }: { engagementId: string; filing: FilingDto }) {
  const actions = useMcaFilingActions(engagementId);
  const [text, setText] = useState('');
  const [cause, setCause] = useState('');
  const log = [...filing.remarks].reverse();
  return (
    <Block title="Remarks" meta={log.length ? `${log.length}` : undefined}>
      {log.length ? (
        <ul className="mb-3 space-y-1.5 text-[13px]">
          {log.slice(0, 8).map((r) => (
            <li key={`${r.at}-${r.byName}`}>
              {r.cause && isRemarkCause(r.cause) ? (
                <Chip tone="idle" raw>
                  {REMARK_CAUSE_INFO[r.cause].label}
                </Chip>
              ) : null}{' '}
              <span className="text-ink">{r.text}</span>
              <span className="text-ink-muted">
                {' '}
                {r.byName}, {fmt(r.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="ROC remark or a note for the team" aria-label="Remark" className="h-control-sm min-w-[240px] flex-1 text-[13px]" />
        <FilterSelect
          aria-label="MCA remark cause"
          value={cause}
          onChange={(e) => setCause(e.target.value)}
          options={[{ value: '', label: 'Cause (MCA remarks)' }, ...REMARK_CAUSES.map((c) => ({ value: c, label: REMARK_CAUSE_INFO[c].label }))]}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!text.trim() || actions.patch.isPending}
          onClick={() =>
            actions.patch.mutate(
              { form: filing.form, remark: text.trim(), ...(cause ? { remarkCause: cause } : {}) },
              { onSuccess: () => { setText(''); setCause(''); }, onError: (e) => toast.error(message(e)) },
            )
          }
        >
          Add remark
        </Button>
      </div>
    </Block>
  );
}

function FilingBody({ bundle, form }: { bundle: FilingBundle; form: FilingForm }) {
  const attachments = useAssistAttachments(bundle.engagementId, form === 'spice-part-b');
  const actions = useMcaFilingActions(bundle.engagementId);
  const [moveTo, setMoveTo] = useState('');
  const filing = bundle.filings.find((f) => f.form === form)!;
  const docs = bundle.documents.filter((d) => d.form === form);
  const portal = docs.find((d) => d.kind === 'portal_pdf');
  const signed = docs.filter((d) => d.kind === 'signed_pdf');
  const freshSigned = signed.find((d) => !d.stale);

  return (
    <>
      <Block title="Where it stands">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Chip tone={STATE_TONE[filing.state] ?? 'prog'} raw>
            {FILING_STATE_LABEL[filing.state]}
          </Chip>
          <span className="text-ink">
            {filing.next.whoLabel}: {filing.next.what}
          </span>
        </div>
        {filing.moves.length ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <FilterSelect
              aria-label="Move the filing to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              options={[{ value: '', label: 'Move to' }, ...filing.moves.map((m) => ({ value: m, label: FILING_STATE_LABEL[m] }))]}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!moveTo || actions.patch.isPending}
              onClick={() =>
                actions.patch.mutate(
                  { form, state: moveTo as FilingState },
                  { onSuccess: () => setMoveTo(''), onError: (e) => toast.error(message(e)) },
                )
              }
            >
              Move
            </Button>
          </div>
        ) : null}
      </Block>
      <Verdict bundle={bundle} form={form} />
      <Deadlines filing={filing} />
      <Packet bundle={bundle} />
      <Readiness bundle={bundle} form={form} attachments={attachments.data} loading={attachments.isPending && form === 'spice-part-b'} />
      <Pdfs bundle={bundle} filing={filing} portal={portal} signed={signed} />
      <Approval engagementId={bundle.engagementId} filing={filing} portal={portal} />
      {form === 'spice-part-b' ? <Signers bundle={bundle} filing={filing} signed={freshSigned} /> : null}
      <References engagementId={bundle.engagementId} filing={filing} />
      <Remarks engagementId={bundle.engagementId} filing={filing} />
    </>
  );
}

/**
 * MCA filing (docs/context/notes/assist-filing.md): the record of a SPICe+ filing beside the
 * attachments card. It shows what Suite really holds and says "Check by hand" for the rest. It
 * never drives the MCA portal, holds no MCA login, OTP or DSC PIN, and never signs. Staff
 * engagement page only. Hidden while VCFO Assist is turned off on the server.
 */
export function McaFilingCard({ engagementId, className }: { engagementId: string; className?: string }) {
  const query = useMcaFiling(engagementId);
  const [picked, setPicked] = useState<FilingForm | null>(null);
  if (query.data === null) return null;
  const bundle = query.data;
  // Opens on Part B once Part A is through or Part B has begun, until someone picks a tab.
  const partA = bundle?.filings.find((f) => f.form === 'spice-part-a');
  const partB = bundle?.filings.find((f) => f.form === 'spice-part-b');
  const form: FilingForm = picked ?? (partA?.state === 'name_approved' || (partB && partB.state !== 'data_ready') ? 'spice-part-b' : 'spice-part-a');
  return (
    <DashSection
      title="MCA filing"
      flush
      loading={query.isPending}
      className={className}
      right={
        bundle ? (
          <SpectrumTabs
            items={FILING_FORMS.map((f) => ({ key: f, label: FILING_FORM_LABEL[f] }))}
            value={form}
            onChange={(key) => setPicked(key as FilingForm)}
          />
        ) : undefined
      }
    >
      {query.isError ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">Could not load the MCA filing record.</p>
      ) : bundle ? (
        <>
          <p className="px-4 pt-3 text-[12.5px] text-ink-muted md:px-5">Software filling on the live MCA portal needs written CS approval first.</p>
          <FilingBody key={form} bundle={bundle} form={form} />
        </>
      ) : null}
    </DashSection>
  );
}
