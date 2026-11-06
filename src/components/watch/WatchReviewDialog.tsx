'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { Textarea } from '@/components/ui/textarea';
import { useWatchActions, useWatchUpdate } from '@/hooks/use-watch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { REG_AREAS, REG_CHANGE_TYPES, REG_IMPORTANCE, type RegReviewEdit, type RegUpdateDetail } from '@/lib/watch/types';
import { AREA_LABEL, IMPORTANCE_LABEL, STATUS_LOOK } from './watch-labels';

const humanise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
const optionsOf = (values: readonly string[]) => values.map((value) => ({ value, label: humanise(value) }));

function draftOf(update: RegUpdateDetail): RegReviewEdit {
  return {
    title: update.title,
    area: (update.area ?? 'general') as RegReviewEdit['area'],
    act: update.act,
    changeType: (update.changeType ?? 'other') as RegReviewEdit['changeType'],
    importance: update.importance ?? 'normal',
    effectiveDate: update.effectiveDate,
    oldDueDate: update.oldDueDate,
    newDueDate: update.newDueDate,
    affects: update.affects ?? '',
    summary: update.summary ?? '',
    quote: update.quote ?? '',
    acceptProblems: false,
  };
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

const FULL_SELECT = 'w-full [&>select]:w-full';

/** The summary beside its source, so the reviewer checks one against the other. */
export function WatchReviewDialog({ id, canReview, onClose }: { id: string | null; canReview: boolean; onClose: () => void }) {
  const query = useWatchUpdate(id);
  const update = query.data?.update;
  const { edit, act } = useWatchActions(id);
  const [draft, setDraft] = useState<RegReviewEdit | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // A fresh read, including after a save, resets the form to what is stored.
  useEffect(() => {
    setDraft(update ? draftOf(update) : null);
    setRejecting(false);
    setReason('');
  }, [update]);

  const hasSummary = update?.summary != null;
  const decided = update?.status === 'published' || update?.status === 'rejected';
  const editable = canReview && hasSummary && !decided;
  const set = (patch: Partial<RegReviewEdit>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const failed = (title: string) => (err: Error) => toastError(title, err.message === 'not_ready' ? 'Save your edits first, and accept anything the check still flags.' : err.message);

  const save = () => {
    if (!draft) return;
    edit.mutate(
      { ...draft, act: draft.act?.trim() || null, effectiveDate: draft.effectiveDate || null, oldDueDate: draft.oldDueDate || null, newDueDate: draft.newDueDate || null },
      {
        onSuccess: ({ problems }) => (problems.length > 0 && !draft.acceptProblems ? toastError('Saved, with flags', 'The check still flags something against the source.') : toastSuccess('Saved')),
        onError: failed('Could not save'),
      },
    );
  };
  const publish = () => act.mutate({ action: 'publish' }, { onSuccess: () => { toastSuccess('Published'); onClose(); }, onError: failed('Could not publish') });
  const reject = () => act.mutate({ action: 'reject', reason }, { onSuccess: () => { toastSuccess('Rejected'); onClose(); }, onError: failed('Could not reject') });
  const retry = () => act.mutate({ action: 'retry' }, { onSuccess: () => { toastSuccess('Reading it again'); onClose(); }, onError: failed('Could not retry') });

  const footer = !update || !canReview || decided ? undefined : rejecting ? (
    <>
      <Button variant="quiet" onClick={() => setRejecting(false)}>
        Back
      </Button>
      <Button variant="destructive" disabled={!reason.trim() || act.isPending} onClick={reject}>
        Reject
      </Button>
    </>
  ) : (
    <>
      <Button variant="quiet" onClick={() => setRejecting(true)}>
        Reject
      </Button>
      {update.status === 'failed' ? (
        <Button onClick={retry} disabled={act.isPending}>
          Read again
        </Button>
      ) : hasSummary ? (
        <>
          <Button variant="secondary" onClick={save} disabled={edit.isPending}>
            Save edits
          </Button>
          <Button onClick={publish} disabled={act.isPending || update.status === 'needs_attention'}>
            Publish
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      open={id != null}
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={<span className="line-clamp-2">{update?.title ?? 'Update'}</span>}
      sub={
        update ? (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
            <Chip raw tone={STATUS_LOOK[update.status].tone}>
              {STATUS_LOOK[update.status].label}
            </Chip>
            {update.sourceName ?? 'Added by hand'}
          </span>
        ) : null
      }
      footer={footer}
    >
      {!update || !draft ? (
        <p className="text-[14px] text-ink-muted">{query.isError ? 'This update could not be opened.' : 'Opening'}</p>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <div className="grid min-w-0 content-start gap-3.5">
            {update.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{update.error}</p> : null}
            {update.rejectReason ? <p className="text-[13px] text-ink-2">Rejected: {update.rejectReason}</p> : null}
            {update.verifyProblems.length > 0 ? (
              <div className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-ink">
                <p className="font-medium">The check flagged these against the source</p>
                <ul className="mt-1 grid gap-0.5">
                  {update.verifyProblems.map((problem) => (
                    <li key={`${problem.field}:${problem.value}`}>
                      {humanise(problem.field)}: {problem.value}. {problem.message}
                    </li>
                  ))}
                </ul>
                {editable ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Checkbox id="watch-accept" checked={draft.acceptProblems === true} onCheckedChange={(checked) => set({ acceptProblems: checked === true })} />
                    <Label htmlFor="watch-accept">I read the source and accept these, then save</Label>
                  </div>
                ) : null}
              </div>
            ) : null}
            {hasSummary ? (
              <fieldset disabled={!editable} className="grid min-w-0 gap-3.5">
                <Field label="Summary" id="watch-summary">
                  <Textarea id="watch-summary" rows={5} maxLength={1200} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
                </Field>
                <Field label="Exact quote from the source" id="watch-quote">
                  <Textarea id="watch-quote" rows={3} maxLength={600} value={draft.quote} onChange={(e) => set({ quote: e.target.value })} />
                </Field>
                <Field label="Who it affects" id="watch-affects">
                  <Input id="watch-affects" maxLength={400} value={draft.affects} onChange={(e) => set({ affects: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Effective date" id="watch-effective">
                    <Input id="watch-effective" type="date" value={draft.effectiveDate ?? ''} onChange={(e) => set({ effectiveDate: e.target.value || null })} />
                  </Field>
                  <Field label="Old due date" id="watch-old">
                    <Input id="watch-old" type="date" value={draft.oldDueDate ?? ''} onChange={(e) => set({ oldDueDate: e.target.value || null })} />
                  </Field>
                  <Field label="New due date" id="watch-new">
                    <Input id="watch-new" type="date" value={draft.newDueDate ?? ''} onChange={(e) => set({ newDueDate: e.target.value || null })} />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Area" id="watch-area">
                    <FilterSelect id="watch-area" size="md" className={FULL_SELECT} options={REG_AREAS.map((value) => ({ value, label: AREA_LABEL[value] }))} value={draft.area} onChange={(e) => set({ area: e.target.value as RegReviewEdit['area'] })} />
                  </Field>
                  <Field label="Change" id="watch-change">
                    <FilterSelect id="watch-change" size="md" className={FULL_SELECT} options={optionsOf(REG_CHANGE_TYPES)} value={draft.changeType} onChange={(e) => set({ changeType: e.target.value as RegReviewEdit['changeType'] })} />
                  </Field>
                  <Field label="Who is told" id="watch-importance">
                    <FilterSelect
                      id="watch-importance"
                      size="md"
                      className={FULL_SELECT}
                      options={REG_IMPORTANCE.map((value) => ({ value, label: IMPORTANCE_LABEL[value] }))}
                      value={draft.importance}
                      onChange={(e) => set({ importance: e.target.value as RegReviewEdit['importance'] })}
                    />
                  </Field>
                </div>
              </fieldset>
            ) : null}
            {rejecting ? (
              <Field label="Why it is rejected" id="watch-reason">
                <Input id="watch-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            ) : null}
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-medium text-ink-2">Source</span>
              {update.sourceUrl ? (
                <a href={update.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Open the original
                </a>
              ) : null}
              {update.fileUrl ? (
                <a href={update.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Open the file
                </a>
              ) : null}
            </div>
            {update.links.length > 1 ? (
              <p className="text-[12.5px] text-ink-muted">Also listed by {update.links.map((link) => link.sourceName ?? link.title).join(', ')}</p>
            ) : null}
            <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-sunken p-3 font-sans text-[13px] leading-relaxed text-ink-2">
              {update.sourceText ?? 'Not read yet.'}
            </pre>
          </div>
        </div>
      )}
    </Modal>
  );
}
