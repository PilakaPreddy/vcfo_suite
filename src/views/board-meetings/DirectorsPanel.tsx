'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pencil, Plus, UserMinus } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { shortDate, todayIst } from '@/lib/board-meetings/dates';
import { useDirectorActions, useDirectors, useMeetings, type DirectorDto } from '@/hooks/use-board-meetings';
import { MeetingWord } from './MeetingWord';
import { Field } from './parts';

type Form = { name: string; din: string; email: string; phone: string; designation: string; appointedOn: string };
const empty: Form = { name: '', din: '', email: '', phone: '', designation: 'Director', appointedOn: '' };

/**
 * CLIENTS › COMPANY › DIRECTORS — the board the notice picker lists. Seeded from the
 * incorporation form; add a director (DIR-12 is due in 30 days and lands on the compliance
 * calendar), fix an email or DIN, or mark one as left. Past directors stay for old meetings.
 * Below, the company's meetings, newest first.
 */
export function DirectorsPanel({ engagementId, compliancesBase }: { engagementId: string; compliancesBase: string }) {
  const q = useDirectors(engagementId, true);
  const meetings = useMeetings(engagementId);
  const acts = useDirectorActions();
  const [form, setForm] = useState<{ id: string | null; f: Form } | null>(null);
  const [leaving, setLeaving] = useState<{ id: string; on: string; reason: string } | null>(null);

  const current = (q.data ?? []).filter((d) => d.current);
  const past = (q.data ?? []).filter((d) => !d.current);

  const save = () => {
    if (!form) return;
    const f = form.f;
    const body = { name: f.name.trim(), din: f.din.trim() || null, email: f.email.trim() || null, phone: f.phone.trim() || null, designation: f.designation.trim() || null };
    const opts = {
      onSuccess: () => {
        setForm(null);
        toastSaved(form.id ? 'Director saved' : 'Director added', { sub: form.id ? undefined : 'DIR-12 is due in 30 days' });
      },
      onError: (e: unknown) => toastError('Could not save the director', errorMessage(e)),
    };
    if (form.id) acts.update.mutate({ id: form.id, body }, opts);
    else acts.add.mutate({ engagementId, ...body, appointedOn: f.appointedOn || null }, opts);
  };

  const cease = () => {
    if (!leaving) return;
    acts.update.mutate(
      { id: leaving.id, body: { cease: { ceasedOn: leaving.on, reason: leaving.reason } } },
      {
        onSuccess: () => {
          setLeaving(null);
          toastSaved('Marked as left', { sub: 'DIR-12 is due in 30 days' });
        },
        onError: (e) => toastError('Could not save', errorMessage(e)),
      },
    );
  };

  const edit = (d: DirectorDto) =>
    setForm({ id: d.id, f: { name: d.name, din: d.din ?? '', email: d.email ?? '', phone: d.phone ?? '', designation: d.designation, appointedOn: d.appointedOn ?? '' } });

  return (
    <div className="flex flex-col gap-4">
      <DashSection
        title="Directors"
        meta={String(current.length)}
        right={
          form ? null : (
            <Button size="sm" onClick={() => setForm({ id: null, f: { ...empty, appointedOn: todayIst() } })}>
              <Plus className="h-4 w-4" aria-hidden /> Add director
            </Button>
          )
        }
        bodyClassName="p-0"
      >
        {form ? (
          <div className="grid grid-cols-1 gap-3 border-b border-line-soft p-4 sm:grid-cols-3">
            {(
              [
                ['name', 'Name'],
                ['din', 'DIN'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['designation', 'Designation'],
              ] as Array<[keyof Form, string]>
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input value={form.f[k]} inputMode={k === 'din' || k === 'phone' ? 'numeric' : undefined} onChange={(e) => setForm({ ...form, f: { ...form.f, [k]: e.target.value } })} />
              </Field>
            ))}
            {form.id ? null : (
              <Field label="Appointed on">
                <Input type="date" value={form.f.appointedOn} onChange={(e) => setForm({ ...form, f: { ...form.f, appointedOn: e.target.value } })} />
              </Field>
            )}
            <div className="flex gap-2 sm:col-span-3">
              <Button size="sm" onClick={save} disabled={!form.f.name.trim() || acts.add.isPending || acts.update.isPending}>
                {form.id ? 'Save' : 'Add director'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {q.isPending ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">DIN</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Since</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...current, ...past].map((d) => (
                <tr key={d.id} className="border-t border-line-soft align-top">
                  <td className="px-4 py-2.5">
                    <span className={d.current ? 'font-medium' : 'text-ink-muted'}>{d.name}</span>
                    <span className="block text-[12.5px] text-ink-muted">{d.designation}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px]">{d.din ?? <span className="text-warning">Missing</span>}</td>
                  <td className="px-3 py-2.5">{d.email ?? <span className="text-warning">No email</span>}</td>
                  <td className="px-3 py-2.5 text-[13px] text-ink-muted">
                    {d.current ? (d.appointedOn ? shortDate(d.appointedOn) : '—') : (
                      <Chip tone="idle" fixed>
                        Left {d.ceasedOn ? shortDate(d.ceasedOn) : ''}
                      </Chip>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {d.current ? (
                      leaving?.id === d.id ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Input type="date" aria-label="Left on" className="w-[150px]" value={leaving.on} onChange={(e) => setLeaving({ ...leaving, on: e.target.value })} />
                          <FilterSelect
                            aria-label="Reason"
                            value={leaving.reason}
                            onChange={(e) => setLeaving({ ...leaving, reason: e.target.value })}
                            options={[
                              { value: 'resigned', label: 'Resigned' },
                              { value: 'removed', label: 'Removed' },
                              { value: 'disqualified', label: 'Disqualified' },
                              { value: 'other', label: 'Other' },
                            ]}
                          />
                          <Button size="sm" onClick={cease} disabled={!leaving.on || acts.update.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLeaving(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="quiet" onClick={() => edit(d)} aria-label={`Edit ${d.name}`}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => setLeaving({ id: d.id, on: todayIst(), reason: 'resigned' })}>
                            <UserMinus className="h-4 w-4" aria-hidden /> Mark as left
                          </Button>
                        </div>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
              {current.length + past.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border-t border-line-soft px-4 py-4 text-ink-muted">
                    No directors yet. They come from the incorporation form, or add them here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </DashSection>

      <DashSection title="Meetings" meta={meetings.data ? String(meetings.data.length) : undefined} bodyClassName="p-0">
        {meetings.data?.length ? (
          <ul className="m-0 list-none p-0">
            {meetings.data.map((m) => (
              <li key={m.id} className="border-t border-line-soft first:border-t-0">
                <Link href={`${compliancesBase}/obligations/meetings/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[14px] hover:bg-hover">
                  <span>
                    <span className="font-mono text-[13px]">{m.meetingNo}</span>
                    <span className="text-ink-muted"> · {shortDate(m.meetingDate)}</span>
                  </span>
                  <MeetingWord word={m.word} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 px-4 py-3 text-[13px] text-ink-muted">No meetings yet. Start one from Obligations › New task › Meeting.</p>
        )}
      </DashSection>
    </div>
  );
}
