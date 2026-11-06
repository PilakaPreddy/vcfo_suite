'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/native-select';
import type { BudgetSection } from '@/lib/budget/model';
import type { ChangeEntry, CommentEntry } from '@/lib/budget/wire';
import { toastError } from '@/lib/toast-errors';
import { Block } from '../cells';
import { ApiError, api, errorText, sectionLabel } from '../format';
import type { Ready } from '../types';

export const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function describeChange(c: ChangeEntry): string {
  const show = (v: unknown) => (v == null || v === '' ? 'blank' : typeof v === 'object' ? ((v as { note?: string }).note ?? 'changed') : String(v));
  const what = [c.rowLabel, c.field].filter(Boolean).join(': ');
  if (c.oldValue === undefined && c.newValue === undefined) return what;
  if (c.oldValue == null && c.newValue == null) return what;
  if (c.oldValue == null) return `${what} (${show(c.newValue)})`;
  return `${what}: ${show(c.oldValue)} to ${show(c.newValue)}`;
}

/** Who said what and who changed what. */
export function ActivityTab({ ready }: { ready: Ready }) {
  const { view } = ready;
  const queryClient = useQueryClient();
  const changes = useQuery({ queryKey: ['budget-changes', view.id], queryFn: () => api<{ changes: ChangeEntry[] }>(`/api/budgets/${view.id}/changes`) });
  const comments = useQuery({ queryKey: ['budget-comments', view.id], queryFn: () => api<{ comments: CommentEntry[] }>(`/api/budgets/${view.id}/comments`) });
  const [section, setSection] = useState<BudgetSection>(view.access.visibleSections[0] ?? 'settings');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = () => queryClient.invalidateQueries({ queryKey: ['budget-comments', view.id] });

  const post = async () => {
    setBusy(true);
    try {
      await api(`/api/budgets/${view.id}/comments`, { method: 'POST', body: JSON.stringify({ section, body }) });
      setBody('');
      void reload();
    } catch (e) {
      toastError('Comment not added', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
    }
  };
  const resolve = async (id: string) => {
    await api(`/api/budgets/${view.id}/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved: true }) }).catch(() => toastError('Comment not updated'));
    void reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block title="Comments">
        <div className="flex flex-col gap-2 border-b border-line-soft p-4">
          <FilterSelect aria-label="Tab" value={section} onChange={(e) => setSection(e.target.value as BudgetSection)} options={view.access.visibleSections.map((s) => ({ value: s, label: sectionLabel(s) }))} />
          <textarea className="min-h-[72px] rounded-md border-1.5 border-line-strong bg-surface-raised p-2 text-[14px] text-ink outline-none focus:border-brand" aria-label="Comment" value={body} onChange={(e) => setBody(e.target.value)} />
          <div>
            <Button size="sm" disabled={!body.trim() || busy} onClick={() => void post()}>
              Add comment
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-line-soft">
          {(comments.data?.comments ?? []).map((c) => (
            <li key={c.id} className={`px-4 py-2.5 text-[14px] ${c.resolvedAt ? 'text-ink-muted' : 'text-ink'}`}>
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-muted">
                {c.authorName}, {sectionLabel(c.section as BudgetSection)}, {stamp(c.createdAt)}
                {c.resolvedAt ? (
                  ' · Resolved'
                ) : (
                  <button type="button" className="underline hover:text-ink" onClick={() => void resolve(c.id)}>
                    Resolve
                  </button>
                )}
              </p>
            </li>
          ))}
          {comments.data && !comments.data.comments.length ? <li className="px-4 py-3 text-[13px] text-ink-muted">No comments yet.</li> : null}
        </ul>
      </Block>

      <Block title="Change log" hint="The latest 300 changes.">
        <ul className="divide-y divide-line-soft">
          {(changes.data?.changes ?? []).map((c) => (
            <li key={c.id} className="px-4 py-2 text-[13px] text-ink">
              {describeChange(c)}
              <div className="text-[12px] text-ink-muted">
                {c.actorName ?? 'System'}, {sectionLabel(c.section as BudgetSection)}, {stamp(c.createdAt)}
              </div>
            </li>
          ))}
          {changes.data && !changes.data.changes.length ? <li className="px-4 py-3 text-[13px] text-ink-muted">No changes yet.</li> : null}
        </ul>
      </Block>
    </div>
  );
}
