'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { MEETING_MODES, MEETING_TYPES, MODE_LABEL, TYPE_LABEL, type MeetingMode, type MeetingType } from '@/lib/board-meetings/model';
import { addDaysIso, todayIst } from '@/lib/board-meetings/dates';
import { useCreateMeeting, useMeetings } from '@/hooks/use-board-meetings';
import { Field } from './parts';

export interface MeetingCompany {
  id: string;
  name: string;
}

/**
 * NEW MEETING — company, kind, type, date, time and mode; "Copy the agenda and directors from
 * the last meeting" is on when there is one. Creating it adds the linked task and opens the
 * meeting page on the Notice tab.
 */
export function NewMeetingDialog({
  open,
  onOpenChange,
  companies,
  defaultCompany,
  basePath,
  postInc = false,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companies: MeetingCompany[];
  defaultCompany?: string;
  basePath: string;
  postInc?: boolean;
  defaultType?: MeetingType;
}) {
  const router = useRouter();
  const create = useCreateMeeting();
  const [company, setCompany] = useState(defaultCompany ?? companies[0]?.id ?? '');
  const [kind, setKind] = useState<'board' | 'agm' | 'egm'>('board');
  const [type, setType] = useState<MeetingType>(defaultType ?? (postInc ? 'first' : 'quarterly'));
  const [date, setDate] = useState(addDaysIso(todayIst(), 21));
  const [time, setTime] = useState('11:00');
  const [mode, setMode] = useState<MeetingMode>('vc');
  const [venue, setVenue] = useState('');
  const [copy, setCopy] = useState(true);
  const past = useMeetings(company || null, open && Boolean(company));
  const last = (past.data ?? []).find((m) => m.status !== 'cancelled');

  const submit = () =>
    create.mutate(
      {
        engagementId: company,
        kind,
        meetingType: type,
        meetingDate: date,
        meetingTime: time,
        mode,
        venue: venue.trim() || undefined,
        postInc,
        copyFromLast: Boolean(last) && copy,
      },
      {
        onSuccess: (m) => {
          onOpenChange(false);
          toastSaved('Meeting created', { sub: `${m.meetingNo} · draft the notice next` });
          router.push(`${basePath}/obligations/meetings/${m.id}?tab=notice`);
        },
        onError: (e) => toastError('Could not create the meeting', errorMessage(e)),
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New meeting</DialogTitle>
          <DialogDescription>The lead drafts the notice; the manager approves it; VCFO emails it to the directors.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company" className="col-span-2">
            <FilterSelect size="md" value={company} onChange={(e) => setCompany(e.target.value)} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Meeting">
            <FilterSelect
              size="md"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'board' | 'agm' | 'egm')}
              options={[
                { value: 'board', label: 'Board meeting' },
                { value: 'agm', label: 'Annual general meeting' },
                { value: 'egm', label: 'Extraordinary general meeting' },
              ]}
            />
          </Field>
          <Field label="Type">
            <FilterSelect size="md" value={type} onChange={(e) => setType(e.target.value as MeetingType)} options={MEETING_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time (IST)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Mode">
            <FilterSelect size="md" value={mode} onChange={(e) => setMode(e.target.value as MeetingMode)} options={MEETING_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          </Field>
          <Field label={mode === 'vc' ? 'Venue (deemed venue, optional)' : 'Venue'}>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Registered office" />
          </Field>
          {last ? (
            <label className="col-span-2 flex items-center gap-2.5 text-[14px]">
              <Checkbox checked={copy} onCheckedChange={(c) => setCopy(c === true)} />
              Copy the agenda and recipients from {last.meetingNo}
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!company || !date || !time || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create and draft notice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "New task" on Obligations asks Task or Meeting. Leads cannot create tasks, so they get a
 * plain "New meeting" button.
 */
export function NewWorkMenu({
  canCreateTask,
  onTask,
  companies,
  defaultCompany,
  basePath,
}: {
  canCreateTask: boolean;
  onTask: () => void;
  companies: MeetingCompany[];
  defaultCompany?: string;
  basePath: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {canCreateTask ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus aria-hidden /> New task <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onTask}>Task</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpen(true)}>Meeting</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden /> New meeting
        </Button>
      )}
      {open ? <NewMeetingDialog open={open} onOpenChange={setOpen} companies={companies} defaultCompany={defaultCompany} basePath={basePath} /> : null}
    </>
  );
}
