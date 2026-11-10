'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { PanelSection, SidePanel } from '@/components/ui/side-panel';
import { Chip } from '@/components/ui/spectrum-chip';
import { Textarea } from '@/components/ui/textarea';
import { fetchDocumentsReview, useDraftNoticeReply, useRequestNoticeDocuments, useUpdateNotice, type NoticeCase, type NoticeReview } from '@/hooks/use-notices';
import { isAdminOrManager } from '@/lib/auth';
import { NOTICE_AUTHORITY_LABEL, NOTICE_STAGE_LABEL, NOTICE_STAGES, type NoticeStage } from '@/lib/notices/model';
import { dueLabel, STAGE_TONE } from './notice-format';

/**
 * One notice case (IDEAS-PLAN wave 2, section C): its facts, the reply draft (edited here and saved
 * through PATCH /api/notices/:id), the documents the reply needs, and the stage. "Draft the reply"
 * runs `compliance.draftNoticeReply` (a private draft). "Ask the client" shows the review of
 * `compliance.requestNoticeDocuments` (recipients and list) before the person sends it. Moving a
 * case to submitted or closed is the partner's approval, so only admins and managers see those.
 */
export function NoticeDrawer({ item, role, onClose, onDone }: { item: NoticeCase | null; role: string; onClose: () => void; onDone: (message: string) => void }) {
  const update = useUpdateNotice();
  const draft = useDraftNoticeReply();
  const request = useRequestNoticeDocuments();
  const [reply, setReply] = useState('');
  const [docs, setDocs] = useState('');
  const [due, setDue] = useState('');
  const [review, setReview] = useState<NoticeReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReply(item?.replyDraft ?? '');
    setDocs((item?.documentsNeeded ?? []).join('\n'));
    setDue(item?.responseDueOn ?? '');
    setReview(null);
    setError(null);
  }, [item?.id, item?.replyDraft, item?.documentsNeeded, item?.responseDueOn]);

  if (!item) return <SidePanel open={false} onOpenChange={onClose} title="" />;

  const partner = isAdminOrManager(role);
  const stages = NOTICE_STAGES.filter((s) => partner || (s !== 'submitted' && s !== 'closed') || s === item.stage);
  const docList = docs.split('\n').map((d) => d.trim()).filter(Boolean);
  const dirty = reply !== (item.replyDraft ?? '') || docList.join('\n') !== item.documentsNeeded.join('\n') || due !== (item.responseDueOn ?? '');

  const run = async (work: () => Promise<string | void>) => {
    setError(null);
    try {
      const message = await work();
      if (message) onDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    }
  };

  const save = () => run(async () => {
    await update.mutateAsync({ id: item.id, patch: { replyDraft: reply || null, documentsNeeded: docList, responseDueOn: due || null } });
    return 'Saved the case.';
  });

  const facts: Array<[string, string | null]> = [
    ['Authority', NOTICE_AUTHORITY_LABEL[item.authority]],
    ['Section', item.section],
    ['Period', item.periodLabel],
    ['DIN', item.din],
    ['Demand', item.demandAmount ? `Rs. ${Number(item.demandAmount).toLocaleString('en-IN')}` : null],
    ['Notice date', item.receivedOn],
    ['Hearing', item.hearingOn],
    ['Owner', item.ownerName],
  ];

  return (
    <SidePanel
      open
      onOpenChange={(open) => (open ? null : onClose())}
      eyebrow={item.companyName}
      title={item.label}
      width={560}
      sub={
        <>
          <Chip tone={STAGE_TONE[item.stage]} raw fixed>
            {NOTICE_STAGE_LABEL[item.stage]}
          </Chip>
          <span className="text-[12.5px] text-ink-muted">{dueLabel(item)}</span>
        </>
      }
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || update.isPending}>
            Save
          </Button>
        </>
      }
    >
      {item.summary ? (
        <PanelSection title="Summary">
          <p className="whitespace-pre-line text-[14px] text-ink">{item.summary}</p>
        </PanelSection>
      ) : null}
      <PanelSection title="Facts">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-muted">{k}</dt>
              <dd className={k === 'DIN' ? 'font-mono text-ink' : 'text-ink'}>{v ?? '—'}</dd>
            </div>
          ))}
          <div>
            <dt className="text-ink-muted">
              <label htmlFor={`due-${item.id}`}>Reply due</label>
            </dt>
            <dd>
              <Input id={`due-${item.id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-control-sm text-[13px]" />
            </dd>
          </div>
        </dl>
        {item.attachments.length > 0 ? <p className="mt-3 text-[12.5px] text-ink-muted">In the vault under Notices: {item.attachments.map((a) => a.fileName).join(', ')}</p> : null}
      </PanelSection>
      <PanelSection title="Stage">
        <FilterSelect
          aria-label="Stage"
          options={stages.map((s) => ({ value: s, label: NOTICE_STAGE_LABEL[s] }))}
          value={item.stage}
          disabled={update.isPending}
          onChange={(e) =>
            void run(async () => {
              const stage = e.target.value as NoticeStage;
              await update.mutateAsync({ id: item.id, patch: { stage } });
              return `Moved to ${NOTICE_STAGE_LABEL[stage]}.`;
            })
          }
        />
        {!partner ? <p className="mt-2 text-[12.5px] text-ink-muted">A manager or partner approves the final reply and marks it submitted.</p> : null}
      </PanelSection>
      <PanelSection title="Reply draft">
        <Textarea rows={12} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply draft" placeholder="Draft the reply here, or let Ask VCFO write a first draft." />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={draft.isPending || item.stage === 'closed'}
            onClick={() =>
              void run(async () => {
                if (dirty && !window.confirm('A new draft replaces the reply and document list you have not saved. Go on?')) return;
                return (await draft.mutateAsync(item.id)).summary;
              })
            }
          >
            {draft.isPending ? 'Drafting…' : item.replyDraft ? 'Draft again' : 'Draft the reply'}
          </Button>
          <span className="text-[12.5px] text-ink-muted">A draft is private. Nothing goes to the client or the department.</span>
        </div>
      </PanelSection>
      <PanelSection title="Documents needed">
        <Textarea rows={5} value={docs} onChange={(e) => setDocs(e.target.value)} aria-label="Documents needed, one per line" placeholder="One document per line" />
        {review ? (
          <div className="mt-3 rounded-md border border-line bg-surface-sunken p-3 text-[13px]">
            <b className="block font-medium text-ink">{review.title}</b>
            <p className="mt-1 whitespace-pre-line text-ink-2">{review.summary}</p>
            <p className="mt-2 text-ink-muted">To: {review.recipients?.length ? review.recipients.map((r) => r.name || r.email).join(', ') : 'nobody'}</p>
            {review.heldReason ? <p className="mt-2 text-warning">{review.heldReason}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={Boolean(review.heldReason) || request.isPending}
                onClick={() =>
                  void run(async () => {
                    const out = await request.mutateAsync({ id: item.id });
                    setReview(null);
                    return out.summary;
                  })
                }
              >
                Send to the client
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={docList.length === 0 || !item.open || Boolean(item.requestListId)}
              onClick={() =>
                void run(async () => {
                  // The review reads the saved list, so unsaved lines are saved first.
                  if (dirty) await update.mutateAsync({ id: item.id, patch: { replyDraft: reply || null, documentsNeeded: docList, responseDueOn: due || null } });
                  setReview(await fetchDocumentsReview(item.id));
                })
              }
            >
              Ask the client for these
            </Button>
            {item.requestListId ? <span className="text-[12.5px] text-ink-muted">Requested from the client; reminders follow until everything is in.</span> : null}
          </div>
        )}
      </PanelSection>
      {error ? (
        <p role="alert" className="px-5 py-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </SidePanel>
  );
}
