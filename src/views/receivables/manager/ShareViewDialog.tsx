'use client';

import { useMemo, useState } from 'react';
import { Copy, Globe, Lock, Mail, MessageCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Tag } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { toastSuccess } from '@/lib/toast-errors';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';
import { describeShareFilters, type ShareFilters } from '@/lib/receivables/share-filters';
import { SHARE_NAME_MAX, type ShareLinkDto, type ShareVisibility } from '@/lib/receivables/share-wire';
import { useManagerSheet } from '@/hooks/use-receivables';
import { useShareLinkActions } from '@/hooks/use-receivables-share-links';
import { stamp } from '../format';
import { copyShareLink, shareMessage } from './share-link-actions';

/**
 * "Share this view" (Phase 10, docs/specs/receivables/PLAN.md): saves the given filters as a named
 * link to the latest published version. The manager picks who may open it (anyone with the link,
 * any client-partner login of the sheet, or only the people named), an expiry and whether the
 * Excel download shows, then copies the link or sends it by WhatsApp or email. With `link` set the
 * same dialog edits that link; the saved filters do not change.
 */

export type ShareViewDialogProps = {
  sheetId: string;
  filters: ShareFilters;
  partnerNames: Record<string, string>;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Edit mode: the link to change. */
  link?: ShareLinkDto | null;
};

type Expiry = 'keep' | 'none' | '7' | '30' | '90' | 'date';

const VISIBILITY: Array<{ value: ShareVisibility; title: string; hint: string; Icon: typeof Globe }> = [
  { value: 'public', title: 'Public', hint: 'Anyone with the link can open it, without signing in.', Icon: Globe },
  { value: 'login', title: 'Any client-partner login', hint: 'Every partner of this sheet who has a login, after signing in.', Icon: Users },
  { value: 'restricted', title: 'Only specific people', hint: 'Only the logins you pick below, after signing in.', Icon: Lock },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitEmails(s: string): string[] {
  return s
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The end of the picked day in India time, so "until 30 Nov" includes 30 Nov. */
function endOfDayIst(iso: string): string {
  return `${iso}T23:59:59+05:30`;
}

export function ShareViewDialog(props: ShareViewDialogProps) {
  if (!props.open) return null;
  return <ShareViewForm key={props.link?.id ?? 'new'} {...props} />;
}

function ShareViewForm({ sheetId, filters, partnerNames, onOpenChange, link }: ShareViewDialogProps) {
  const editing = Boolean(link);
  const sheet = useManagerSheet(sheetId);
  const actions = useShareLinkActions(sheetId);
  const filterText = describeShareFilters(link?.filters ?? filters, partnerNames);
  const withLogin = useMemo(
    () => (sheet.data?.partners ?? []).filter((p) => p.active && (p.loginState === 'active' || p.loginState === 'invited')),
    [sheet.data],
  );
  const partnerEmails = new Set(withLogin.map((p) => p.email.toLowerCase()));

  const [name, setName] = useState(link?.name ?? filterText.slice(0, SHARE_NAME_MAX));
  const [visibility, setVisibility] = useState<ShareVisibility>(link?.visibility ?? 'login');
  const [picked, setPicked] = useState<string[]>(() => link?.allowedEmails ?? []);
  const [extra, setExtra] = useState('');
  const [expiry, setExpiry] = useState<Expiry>(link ? 'keep' : '30');
  const [date, setDate] = useState(addDaysIso(todayIst(), 14));
  const [allowDownload, setAllowDownload] = useState(link?.allowDownload ?? true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShareLinkDto | null>(null);

  // Emails of the link that are not a partner login of the sheet show in the free field's list.
  const otherPicked = picked.filter((e) => !partnerEmails.has(e));
  const extraEmails = splitEmails(extra);
  const allEmails = [...new Set([...picked, ...extraEmails])];

  const toggle = (email: string, on: boolean) => setPicked((list) => (on ? [...new Set([...list, email])] : list.filter((e) => e !== email)));

  const expiresAt = (): string | null | undefined => {
    if (expiry === 'keep') return undefined;
    if (expiry === 'none') return null;
    if (expiry === 'date') return endOfDayIst(date);
    return new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the link a name.');
    const bad = extraEmails.find((e) => !EMAIL.test(e));
    if (bad) return setError(`“${bad}” is not a valid email.`);
    if (visibility === 'restricted' && !allEmails.length) return setError('Pick at least one person, or type an email.');
    if (expiry === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIst())) return setError('Pick an expiry date from today on.');
    const body = {
      name: name.trim(),
      visibility,
      allowedEmails: visibility === 'restricted' ? allEmails : [],
      allowDownload,
      expiresAt: expiresAt(),
    };
    try {
      if (link) {
        await actions.update.mutateAsync({ id: link.id, ...body });
        toastSuccess('Link saved', body.name);
        onOpenChange(false);
      } else {
        setCreated(await actions.create.mutateAsync({ ...body, filters, expiresAt: body.expiresAt ?? null }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The link was not saved.');
    }
  };

  if (created) return <CreatedLink link={created} onDone={() => onOpenChange(false)} />;

  const busy = actions.create.isPending || actions.update.isPending;
  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={editing ? 'Edit shared view' : 'Share this view'}
      sub={<Tag>{filterText}</Tag>}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Create link'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" htmlFor="rcv-share-name" hint="The title people see at the top of the view.">
          <Input id="rcv-share-name" value={name} maxLength={SHARE_NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </Field>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Who can open it</legend>
          {VISIBILITY.map(({ value, title, hint, Icon }) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
                visibility === value ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-hover',
              )}
            >
              <input type="radio" name="rcv-share-visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="mt-1" />
              <Icon aria-hidden className="mt-0.5 size-4 flex-none text-ink-muted" />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{title}</span>
                <span className="block text-[12.5px] text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {visibility === 'restricted' ? (
          <div className="grid gap-2 rounded-md border border-line-soft bg-surface-sunken px-3 py-3">
            <div className="text-[13px] font-medium text-ink-2">People who can open it</div>
            {sheet.isLoading ? <p className="text-[13px] text-ink-muted">Loading the partners…</p> : null}
            {!sheet.isLoading && !withLogin.length ? <p className="text-[13px] text-ink-muted">No partner of this sheet has a login yet. Type the emails instead.</p> : null}
            {withLogin.map((p) => {
              const email = p.email.toLowerCase();
              return (
                <label key={p.id} className="flex min-w-0 cursor-pointer items-center gap-2.5 text-[13px]">
                  <Checkbox checked={picked.includes(email)} onCheckedChange={(v) => toggle(email, v === true)} />
                  <span className="font-medium">{p.name}</span>
                  <span className="min-w-0 truncate text-ink-muted">{p.email}</span>
                  {p.loginState === 'invited' ? <Tag tone="warn">Invited</Tag> : null}
                </label>
              );
            })}
            {otherPicked.map((email) => (
              <label key={email} className="flex min-w-0 cursor-pointer items-center gap-2.5 text-[13px]">
                <Checkbox checked onCheckedChange={() => toggle(email, false)} />
                <span className="min-w-0 truncate">{email}</span>
              </label>
            ))}
            <Field label="Other emails" htmlFor="rcv-share-emails" hint="Separate with commas. Each person signs in with this email to open the view." className="mt-1">
              <Input id="rcv-share-emails" value={extra} placeholder="name@company.com" onChange={(e) => setExtra(e.target.value)} />
            </Field>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expires" htmlFor="rcv-share-expiry" hint={link?.expiresAt && expiry === 'keep' ? `Now until ${stamp(link.expiresAt)}` : undefined}>
            <FilterSelect
              id="rcv-share-expiry"
              size="md"
              className="w-full [&>select]:w-full"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as Expiry)}
              options={[
                ...(editing ? [{ value: 'keep', label: link?.expiresAt ? 'Keep as it is' : 'Never (as it is)' }] : []),
                { value: 'none', label: 'Never' },
                { value: '7', label: 'In 7 days' },
                { value: '30', label: 'In 30 days' },
                { value: '90', label: 'In 90 days' },
                { value: 'date', label: 'On a date' },
              ]}
            />
          </Field>
          {expiry === 'date' ? (
            <Field label="Last day" htmlFor="rcv-share-date">
              <Input id="rcv-share-date" type="date" value={date} min={todayIst()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5 text-[14px]">
          <Checkbox id="rcv-share-download" checked={allowDownload} onCheckedChange={(v) => setAllowDownload(v === true)} />
          <label htmlFor="rcv-share-download" className="cursor-pointer">
            Allow Excel download
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function CreatedLink({ link, onDone }: { link: ShareLinkDto; onDone: () => void }) {
  const to = link.visibility === 'restricted' ? link.allowedEmails.join(',') : '';
  const mail = `mailto:${encodeURIComponent(to).replace(/%2C/g, ',')}?subject=${encodeURIComponent(`${link.name}: receivables from SBC`)}&body=${encodeURIComponent(`The receivables view "${link.name}" is here:\n${link.url}\n`)}`;
  const tile = 'h-11 justify-center';
  return (
    <Modal open onOpenChange={(o) => !o && onDone()} title="Link ready" sub={<Tag tone="ok">{link.name}</Tag>} size="md" footer={<Button onClick={onDone}>Done</Button>}>
      <div className="grid gap-3">
        <div className="flex gap-2">
          <Input readOnly value={link.url} className="font-mono text-[12px]" aria-label="Shared view link" onFocus={(e) => e.target.select()} />
          <Button onClick={() => void copyShareLink(link.url)}>
            <Copy aria-hidden /> Copy
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className={tile} asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareMessage(link))}`} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden /> WhatsApp
            </a>
          </Button>
          <Button variant="secondary" className={tile} asChild>
            <a href={mail}>
              <Mail aria-hidden /> Email
            </a>
          </Button>
        </div>
        <p className="text-[12.5px] text-ink-muted">
          {link.visibility === 'public'
            ? 'Anyone with this link sees the view. It always shows the latest published version.'
            : link.visibility === 'login'
              ? 'Client partners of this sheet sign in to see the view. It always shows the latest published version.'
              : 'Only the people you picked can open it, after signing in. It always shows the latest published version.'}
        </p>
      </div>
    </Modal>
  );
}
