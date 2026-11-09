'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { Chip } from '@/components/ui/spectrum-chip';
import { SECTION_TEAM, type BudgetSection } from '@/lib/budget/model';
import { toastError } from '@/lib/toast-errors';
import { ApiError, SECTION_WORD, api, errorText, sectionLabel } from './format';
import type { Ready } from './types';

const HELP: Record<BudgetSection, string> = {
  hiring: 'One row per role, with annual CTC, opening headcount, and joiners and exits by month. Headcount and salary follow.',
  benefits: 'One row per benefit: its cost basis, cost per unit, who it applies to and when it is charged.',
  admin: 'Costs that do not follow headcount. Use an amount and a frequency, or type one-off amounts by month.',
  finance: 'Fees, bank charges and statutory costs, and the income-tax assumptions.',
  settings: 'The year, currencies, departments and budget lines that every other tab uses.',
};

/** Who fills this tab, by when, and where it stands. */
export function SectionBar({ ready, section }: { ready: Ready; section: BudgetSection }) {
  const { view, b } = ready;
  const data = view.sections.find((s) => s.section === section);
  const [assigning, setAssigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const word = SECTION_WORD[data.status];
  const draft = view.status === 'draft';
  const canEdit = ready.canEdit(section);

  const act = async (body: object, done?: () => void) => {
    setBusy(true);
    try {
      await api(`/api/budgets/${view.id}/sections/${section}`, { method: 'POST', body: JSON.stringify(body) });
      done?.();
      void b.refresh();
    } catch (e) {
      toastError('Not saved', e instanceof ApiError ? errorText(e.code, e.detail) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-muted">
        <Chip raw tone={word.tone}>
          {word.label}
        </Chip>
        <span>
          {SECTION_TEAM[section]} team{data.owners.length ? `: ${data.owners.map((o) => o.name).join(', ')}` : ', no owner named yet'}
        </span>
        {data.dueDate ? <span>Due {data.dueDate}</span> : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {view.access.canManage && draft ? (
            <Button variant="outline" size="sm" onClick={() => setAssigning(true)}>
              Owners and due date
            </Button>
          ) : null}
          {view.access.canManage && draft ? (
            <Button variant="outline" size="sm" onClick={() => setSending(true)}>
              Send back
            </Button>
          ) : null}
          {canEdit && data.status !== 'done' ? (
            <Button size="sm" disabled={busy} onClick={() => void act({ action: 'done' })}>
              Mark done
            </Button>
          ) : null}
          {canEdit && data.status === 'done' ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act({ action: 'reopen' })}>
              Open again
            </Button>
          ) : null}
        </span>
      </div>
      <p className="text-[13px] text-ink-muted">{HELP[section]}</p>
      {data.status === 'sent_back' && data.note ? <p className="text-[13px] text-danger">Sent back: {data.note}</p> : null}

      {assigning ? <OwnersDialog ready={ready} section={section} onClose={() => setAssigning(false)} onSave={(userIds, dueDate) => act({ action: 'owners', userIds, dueDate }, () => setAssigning(false))} /> : null}
      {sending ? (
        <Modal
          open
          onOpenChange={(open) => !open && setSending(false)}
          title={`Send back ${sectionLabel(section)}`}
          sub="The owners get the reason by email and in the bell."
          footer={
            <>
              <Button variant="outline" onClick={() => setSending(false)}>
                Cancel
              </Button>
              <Button disabled={!note.trim() || busy} onClick={() => void act({ action: 'send_back', note }, () => { setSending(false); setNote(''); })}>
                Send back
              </Button>
            </>
          }
        >
          <textarea className="min-h-[96px] w-full rounded-md border-1.5 border-line-strong bg-surface-raised p-2 text-[14px] text-ink outline-none focus:border-brand" aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
        </Modal>
      ) : null}
    </div>
  );
}

function OwnersDialog({ ready, section, onClose, onSave }: { ready: Ready; section: BudgetSection; onClose: () => void; onSave: (userIds: string[], dueDate: string | null) => void }) {
  const { view } = ready;
  const data = view.sections.find((s) => s.section === section);
  const [chosen, setChosen] = useState<string[]>(data?.owners.map((o) => o.userId) ?? []);
  const [due, setDue] = useState(data?.dueDate ?? '');
  const list = [...view.people].sort((a, b) => Number(b.isClient) - Number(a.isClient) || a.name.localeCompare(b.name));
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${sectionLabel(section)}: owners`}
      sub={`This tab belongs to the ${SECTION_TEAM[section]} team. Name the people on that team. They are told by email.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(chosen, due || null)}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
          {list.map((p) => (
            <li key={p.userId}>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <Checkbox checked={chosen.includes(p.userId)} onCheckedChange={(v) => setChosen((c) => (v === true ? [...c, p.userId] : c.filter((x) => x !== p.userId)))} />
                {p.name} <span className="text-[12px] text-ink-muted">{p.isClient ? 'Client' : 'SBC'}</span>
              </label>
            </li>
          ))}
          {!list.length ? <li className="text-[13px] text-ink-muted">Nobody is on this client yet.</li> : null}
        </ul>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Due date
          <input type="date" className="h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[14px] font-normal text-ink" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
