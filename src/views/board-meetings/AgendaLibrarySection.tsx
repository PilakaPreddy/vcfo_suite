'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, Pencil, Search, Upload } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { libraryCsv, libraryRowsFromCsv } from '@/lib/board-meetings/library-csv';
import { Field } from './parts';
import { useAgendaLibrary, useLibraryActions, useTemplates, type LibraryItemDto } from '@/hooks/use-board-meetings';

/**
 * FIRM SETTINGS › AGENDA LIBRARY — the SBC agenda master (224 items in 16 topics) that the
 * notice's agenda picker reads. Firm admins edit the wording, turn items off, and import a CSV
 * saved from the Excel master; everyone else reads it. Saved agenda templates are listed below.
 */
export function AgendaLibrarySection({ canEdit }: { canEdit: boolean }) {
  const lib = useAgendaLibrary(true);
  const templates = useTemplates(null);
  const actions = useLibraryActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [editing, setEditing] = useState<LibraryItemDto | null>(null);

  const items = lib.data?.items;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (items ?? []).filter((i) => (!topic || i.topic === topic) && words.every((w) => `${i.id} ${i.scenario} ${i.wording} ${i.law}`.toLowerCase().includes(w)));
  }, [items, q, topic]);

  const download = () => {
    const blob = new Blob([libraryCsv(items ?? [])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SBC_agenda_library.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const { rows, skipped, missing } = libraryRowsFromCsv(await file.text());
    if (missing.length) return toastError('Columns missing', `The CSV needs ${missing.join(' and ')} columns.`);
    if (!rows.length) return toastError('No rows to import');
    actions.importItems.mutate(rows, {
      onSuccess: (r) => toastSaved('Library imported', { sub: `${r.added} added · ${r.updated} updated${skipped ? ` · ${skipped} skipped` : ''}` }),
      onError: (e) => toastError('Could not import', errorMessage(e)),
    });
  };

  const save = (item: LibraryItemDto, body: Partial<LibraryItemDto>) =>
    actions.update.mutate(
      { id: item.id, body },
      {
        onSuccess: () => {
          setEditing(null);
          toastSaved(body.active === undefined ? 'Item saved' : body.active ? 'Item turned on' : 'Item turned off');
        },
        onError: (e) => toastError('Could not save', errorMessage(e)),
      },
    );

  if (lib.isPending) return <SkeletonRows rows={8} />;

  return (
    <div className="flex flex-col gap-3">
      <DashSection
        title="Agenda library"
        meta={`${items?.filter((i) => i.active).length ?? 0} of ${items?.length ?? 0} on`}
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={download}>
              <Download className="h-4 w-4" aria-hidden /> Download CSV
            </Button>
            {canEdit ? (
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={actions.importItems.isPending}>
                <Upload className="h-4 w-4" aria-hidden /> Import CSV
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input aria-label="Search the library" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wording, ID or law" className="pl-8" />
          </div>
          <FilterSelect
            aria-label="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            options={[{ value: '', label: 'All topics' }, ...(lib.data?.topics ?? []).map((t) => ({ value: t.topic, label: `${t.topic} (${(items ?? []).filter((i) => i.topic === t.topic).length})` }))]}
          />
          <span className="text-[12.5px] text-ink-muted">{shown.length} shown</span>
        </div>
        <ul className="m-0 max-h-[640px] list-none overflow-y-auto p-0">
          {shown.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 border-b border-line-soft px-4 py-3 last:border-b-0">
              {editing?.id === i.id ? (
                <LibraryEditor item={editing} onChange={setEditing} onSave={() => save(i, { wording: editing.wording, scenario: editing.scenario, law: editing.law, applicability: editing.applicability, action: editing.action })} onCancel={() => setEditing(null)} busy={actions.update.isPending} />
              ) : (
                <div className="flex items-start gap-3">
                  <span className="w-[64px] flex-none pt-0.5 font-mono text-[12.5px] text-ink-muted">{i.id}</span>
                  <div className="min-w-0 flex-1">
                    <p className={i.active ? 'm-0 text-[14px]' : 'm-0 text-[14px] text-ink-faint line-through'}>{i.wording}</p>
                    <p className="m-0 mt-1 flex flex-wrap gap-1.5 text-[12px] text-ink-muted">
                      <Tag>{i.topic}</Tag>
                      {i.action ? <Tag tone={/resolution/i.test(i.action) ? 'prog' : 'idle'}>{i.action}</Tag> : null}
                      {i.applicability ? <span>{i.applicability}</span> : null}
                      {i.law ? <span>· {i.law}</span> : null}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-none items-center gap-2">
                      <Switch checked={i.active} onCheckedChange={(v) => save(i, { active: v })} aria-label={`${i.id} on in the picker`} />
                      <Button size="sm" variant="quiet" onClick={() => setEditing(i)} aria-label={`Edit ${i.id}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </DashSection>

      <DashSection title="Agenda templates" meta={String(templates.data?.length ?? 0)}>
        {templates.data?.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {templates.data.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="text-ink-muted">
                  {t.meetingType} · {t.agenda.length} items{t.scope === 'client' ? ' · one client' : ' · firm-wide'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-ink-muted">Save an agenda as a template from the agenda picker of any notice.</p>
        )}
      </DashSection>
    </div>
  );
}

function LibraryEditor({
  item,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  item: LibraryItemDto;
  onChange: (i: LibraryItemDto) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const set = (p: Partial<LibraryItemDto>) => onChange({ ...item, ...p });
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Field label={`Agenda wording (${item.id}) — use [square brackets] for fields the lead fills`} className="sm:col-span-2">
        <Textarea rows={3} value={item.wording} onChange={(e) => set({ wording: e.target.value })} />
      </Field>
      <Field label="Scenario">
        <Input value={item.scenario} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <Field label="Law">
        <Input value={item.law} onChange={(e) => set({ law: e.target.value })} />
      </Field>
      <Field label="Applicability">
        <Input value={item.applicability} onChange={(e) => set({ applicability: e.target.value })} />
      </Field>
      <Field label="Action">
        <Input value={item.action} onChange={(e) => set({ action: e.target.value })} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={onSave} disabled={busy || !item.wording.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
