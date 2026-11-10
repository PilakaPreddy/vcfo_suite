'use client';

import { useEffect, useState } from 'react';
import {
  AlarmClock,
  AlignLeft,
  BellRing,
  Check,
  Clock,
  FileText,
  Lock,
  Megaphone,
  Moon,
  Newspaper,
  Rss,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { toastUndo } from '@/components/ui/undo-toast';
import { toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import type {
  EmailOptional,
  NotificationPrefs,
  NotificationPrefsPatch,
  RemindDays,
  StaffAlert,
  WhatsAppCategory,
} from '@/lib/client-portal/notification-prefs';

/** The role alert a staff person can switch (P-627): admin and super get escalations, a manager approvals. */
function roleAlert(role: string | undefined): { key: StaffAlert; label: string } | null {
  if (role === 'admin' || role === 'super_admin') return { key: 'escalations', label: 'Escalations' };
  if (role === 'manager') return { key: 'approvalsWaiting', label: 'Approvals waiting' };
  return null;
}

const REMIND_TABS = [
  { key: 'default', label: 'Default' },
  { key: '7', label: '7 days' },
  { key: '3', label: '3 days' },
  { key: '1', label: '1 day' },
];
import { ProfileCard, SettingsRow } from './settings-layout';

/*
 * Profile › Notifications (G-25, prototype ProfileScreen "notify"): email and WhatsApp per
 * category, quiet hours and the weekly digest, on the same `notification_prefs` store as the
 * client Settings page. Email for documents, steps, deadlines and timeline is locked on, as for
 * clients. The WhatsApp job reads the categories and quiet hours before it sends.
 */

type Row = {
  label: string;
  email?: EmailOptional;
  whatsapp?: WhatsAppCategory;
  locked?: boolean;
  Icon: LucideIcon;
  /** The tint of the 28px row tile (R-16), from the prototype's settings rows. */
  tile: string;
};

const ROWS: Row[] = [
  { label: 'Documents requested or sent back', whatsapp: 'docs', locked: true, Icon: FileText, tile: 'bg-warning-soft text-warning' },
  { label: 'Step accepted or needs changes', whatsapp: 'steps', locked: true, Icon: Check, tile: 'bg-positive-soft text-positive' },
  { label: 'Deadlines and reminders', whatsapp: 'deadlines', locked: true, Icon: Clock, tile: 'bg-danger-soft text-danger' },
  { label: 'Timeline changes', whatsapp: 'timeline', locked: true, Icon: AlignLeft, tile: 'bg-brand-soft text-brand-text' },
  { label: 'Announcements', email: 'announcements', whatsapp: 'announcements', Icon: Megaphone, tile: 'bg-brand-soft text-brand-text' },
  { label: 'Official feed news', email: 'feed', whatsapp: 'feed', Icon: Rss, tile: 'bg-waiting-soft text-waiting' },
  { label: 'Weekly digest', email: 'weeklyDigest', Icon: FileText, tile: 'bg-identity-soft text-identity' },
];

function RowTile({ Icon, tile }: { Icon: LucideIcon; tile: string }) {
  return (
    <span className={cn('grid h-7 w-7 flex-none place-items-center rounded-md', tile)} aria-hidden>
      <Icon className="h-[15px] w-[15px]" strokeWidth={1.6} />
    </span>
  );
}

const timeInput = 'h-9 w-[112px] font-mono text-[13px] tabular-nums';

export function NotificationsCard({
  id,
  title,
  whatsappOn,
  email,
  whatsappNumber,
  userRole: role,
}: {
  id: string;
  title: string;
  /** The signed-in role. Staff get the reminder, daily digest and role alert rows (P-626, P-627). */
  userRole?: string;
  whatsappOn: boolean;
  /** The sign-in address that every email goes to. */
  email?: string;
  /** The WhatsApp number in E.164, when one is set. */
  whatsappNumber?: string;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState({ start: '', end: '' });
  const [digestDraft, setDigestDraft] = useState('');
  const staff = role === 'super_admin' || role === 'admin' || role === 'manager' || role === 'intern';
  const alert = roleAlert(role);
  // The developer gets no client or step updates, so the per-kind table stays out (G-01).
  const developer = role === 'developer';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/notification-prefs')
      .then(async (res) => {
        if (!res.ok) throw new Error('load_failed');
        const json = (await res.json()) as { prefs: NotificationPrefs };
        if (cancelled) return;
        setPrefs(json.prefs);
        setDraft({ start: json.prefs.quietStart, end: json.prefs.quietEnd });
        setDigestDraft(json.prefs.digestTime ?? '');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Saves one change; `undo` is the patch that puts it back, offered in the toast (A2). */
  async function save(patch: NotificationPrefsPatch, undo?: { text: string; patch: NotificationPrefsPatch }) {
    if (!prefs) return;
    const before = prefs;
    // Show the change at once; put it back if the save fails.
    setPrefs({
      ...prefs,
      email: { ...prefs.email, ...(patch.email ?? {}) },
      whatsapp: { ...prefs.whatsapp, ...(patch.whatsapp ?? {}) },
      quietHours: patch.quietHours ?? prefs.quietHours,
      quietStart: patch.quietStart ?? prefs.quietStart,
      quietEnd: patch.quietEnd ?? prefs.quietEnd,
      alerts: prefs.alerts ? { ...prefs.alerts, ...(patch.alerts ?? {}) } : prefs.alerts,
      remindDays: patch.remindDays !== undefined ? patch.remindDays : prefs.remindDays,
      digestTime: patch.digestTime !== undefined ? patch.digestTime : prefs.digestTime,
    });
    setSaving(true);
    try {
      const res = await fetch('/api/account/notification-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as { prefs?: NotificationPrefs };
      if (!res.ok || !json.prefs) throw new Error('save_failed');
      setPrefs(json.prefs);
      setSaved(true);
      if (undo) toastUndo(undo.text, () => void save(undo.patch));
    } catch {
      setPrefs(before);
      setDraft({ start: before.quietStart, end: before.quietEnd });
      setDigestDraft(before.digestTime ?? '');
      toastError('Not saved', 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  // The "Saved" chip in the card head shows for a moment after each save (prototype FormSection).
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1500);
    return () => window.clearTimeout(t);
  }, [saved]);

  function flip(row: Row, channel: 'email' | 'whatsapp', on: boolean) {
    const word = channel === 'email' ? 'email' : 'WhatsApp';
    const key = channel === 'email' ? row.email : row.whatsapp;
    if (!key) return;
    const patch = (v: boolean): NotificationPrefsPatch =>
      channel === 'email' ? { email: { [key]: v } } : { whatsapp: { [key]: v } };
    void save(patch(on), { text: `${row.label} · ${word} ${on ? 'on' : 'off'}`, patch: patch(!on) });
  }

  function saveTime(which: 'start' | 'end') {
    if (!prefs) return;
    const value = which === 'start' ? draft.start : draft.end;
    const current = which === 'start' ? prefs.quietStart : prefs.quietEnd;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || value === current) {
      setDraft({ start: prefs.quietStart, end: prefs.quietEnd });
      return;
    }
    void save(which === 'start' ? { quietStart: value } : { quietEnd: value });
  }

  function saveDigestTime() {
    if (!prefs) return;
    const value = digestDraft;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || value === prefs.digestTime) {
      setDigestDraft(prefs.digestTime ?? '');
      return;
    }
    void save({ digestTime: value });
  }

  return (
    <ProfileCard
      id={id}
      title={title}
      meta={
        saving ? (
          'Saving…'
        ) : saved ? (
          <Chip fixed tone="ok">
            Saved
          </Chip>
        ) : undefined
      }
    >
      {!prefs ? (
        <SettingsRow label="Channels">
          {failed ? (
            <span className="text-ink-muted">Could not load</span>
          ) : (
            <span className="block h-4 w-48 animate-pulse rounded-mark bg-surface-sunken" aria-hidden />
          )}
        </SettingsRow>
      ) : (
        <>
          <div className="grid grid-cols-1 border-b border-line-soft sm:grid-cols-2">
            <div className="flex items-center gap-3 px-4 py-3 md:px-5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">Email</span>
                <span className="block truncate text-[12.5px] text-ink-muted">{email || 'Your sign-in address'}</span>
              </span>
              <Tag>Always on</Tag>
            </div>
            <div className="flex items-center gap-3 border-t border-line-soft px-4 py-3 sm:border-l sm:border-t-0 md:px-5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">WhatsApp</span>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {whatsappOn ? whatsappNumber || 'On' : 'Off · set it under About you'}
                </span>
              </span>
              <Chip fixed tone={whatsappOn ? 'ok' : 'idle'}>
                {whatsappOn ? 'On' : 'Off'}
              </Chip>
            </div>
          </div>
          {developer ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-[14px]">
              <caption className="sr-only">Email and WhatsApp per kind of update</caption>
              <thead>
                <tr className="h-9 border-b border-line-soft text-left text-[12px] font-medium text-ink-muted">
                  <th scope="col" className="pl-4 pr-3 font-medium md:pl-5">
                    Tell me when
                  </th>
                  <th scope="col" className="w-[76px] text-center font-medium">
                    Email
                  </th>
                  <th scope="col" className="w-[100px] pr-4 text-center font-medium md:pr-5">
                    WhatsApp
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="h-[52px] border-t border-line-soft first:border-t-0">
                    <th scope="row" className="pl-4 pr-3 text-left font-normal text-ink md:pl-5">
                      <span className="flex items-center gap-3">
                        <RowTile Icon={r.Icon} tile={r.tile} />
                        {r.label}
                      </span>
                    </th>
                    <td className="text-center">
                      {r.locked ? (
                        <span
                          className="inline-flex h-6 items-center gap-1 rounded-sm bg-surface-sunken px-2 text-[12px] font-medium text-ink-muted"
                          title="Always on"
                          aria-label={`${r.label} by email, always on`}
                        >
                          <Lock className="h-[11px] w-[11px]" strokeWidth={1.6} aria-hidden /> On
                        </span>
                      ) : r.email ? (
                        <span className="inline-flex">
                          <Switch
                            checked={prefs.email[r.email]}
                            onCheckedChange={(v) => flip(r, 'email', v)}
                            aria-label={`${r.label} by email`}
                          />
                        </span>
                      ) : null}
                    </td>
                    <td className="pr-4 text-center md:pr-5">
                      {r.whatsapp ? (
                        <span className={cn('inline-flex', !whatsappOn && 'opacity-40')}>
                          <Switch
                            checked={whatsappOn && prefs.whatsapp[r.whatsapp]}
                            disabled={!whatsappOn}
                            onCheckedChange={(v) => flip(r, 'whatsapp', v)}
                            aria-label={`${r.label} on WhatsApp`}
                          />
                        </span>
                      ) : (
                        <span className="text-ink-faint" aria-hidden>
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
            <RowTile Icon={Moon} tile="bg-identity-soft text-identity" />
            <span className="min-w-0 flex-1 text-[14px] text-ink">Quiet hours · no WhatsApp in this window, India time</span>
            <span className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                aria-label="Quiet hours start"
                value={draft.start}
                disabled={!prefs.quietHours}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                onBlur={() => saveTime('start')}
                className={timeInput}
              />
              <span className="text-ink-muted">to</span>
              <Input
                type="time"
                aria-label="Quiet hours end"
                value={draft.end}
                disabled={!prefs.quietHours}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                onBlur={() => saveTime('end')}
                className={timeInput}
              />
              <Switch
                checked={prefs.quietHours}
                onCheckedChange={(v) =>
                  void save(
                    { quietHours: v },
                    { text: v ? 'Quiet hours on' : 'Quiet hours off', patch: { quietHours: !v } },
                  )
                }
                aria-label="Quiet hours"
              />
            </span>
          </div>
          {staff ? (
            <>
              {/* Stored on notification_prefs (remind_days, digest_time). No job reads them yet. */}
              <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
                <RowTile Icon={AlarmClock} tile="bg-danger-soft text-danger" />
                <span className="min-w-0 flex-1 text-[14px] text-ink">Remind me before a due date</span>
                <SpectrumTabs
                  label="Days before a due date"
                  items={REMIND_TABS}
                  value={prefs.remindDays ? String(prefs.remindDays) : 'default'}
                  onChange={(k) => {
                    const next = k === 'default' ? null : (Number(k) as RemindDays);
                    const prev = prefs.remindDays ?? null;
                    void save({ remindDays: next }, { text: `Reminder · ${k === 'default' ? 'default' : `${k} days before`}`, patch: { remindDays: prev } });
                  }}
                />
              </div>
              <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
                <RowTile Icon={Newspaper} tile="bg-identity-soft text-identity" />
                <span className="min-w-0 flex-1 text-[14px] text-ink">Daily digest by email</span>
                <span className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label="Daily digest time"
                    value={digestDraft}
                    disabled={!prefs.digestTime}
                    onChange={(e) => setDigestDraft(e.target.value)}
                    onBlur={saveDigestTime}
                    className={timeInput}
                  />
                  <Switch
                    checked={Boolean(prefs.digestTime)}
                    onCheckedChange={(v) => {
                      const prev = prefs.digestTime ?? null;
                      const next = v ? prev ?? '08:00' : null;
                      setDigestDraft(next ?? '');
                      void save({ digestTime: next }, { text: v ? 'Daily digest on' : 'Daily digest off', patch: { digestTime: prev } });
                    }}
                    aria-label="Daily digest"
                  />
                </span>
              </div>
              {alert && prefs.alerts ? (
                <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
                  <RowTile Icon={BellRing} tile="bg-warning-soft text-warning" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">{alert.label}</span>
                  <Switch
                    checked={prefs.alerts[alert.key]}
                    onCheckedChange={(v) =>
                      void save(
                        { alerts: { [alert.key]: v } },
                        { text: `${alert.label} ${v ? 'on' : 'off'}`, patch: { alerts: { [alert.key]: !v } } },
                      )
                    }
                    aria-label={alert.label}
                  />
                </div>
              ) : null}
              {role === 'super_admin' && prefs.alerts ? (
                /* P-639: the super admin's monthly partner report; off holds their monthly scheduled reports. */
                <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
                  <RowTile Icon={Newspaper} tile="bg-identity-soft text-identity" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">Monthly partner report</span>
                  <Switch
                    checked={prefs.alerts.partnerReport}
                    onCheckedChange={(v) =>
                      void save(
                        { alerts: { partnerReport: v } },
                        { text: `Monthly partner report ${v ? 'on' : 'off'}`, patch: { alerts: { partnerReport: !v } } },
                      )
                    }
                    aria-label="Monthly partner report"
                  />
                </div>
              ) : null}
              {prefs.alerts ? (
                /* IDEAS-PLAN F: the optional weekday "My day" email at 08:40, off until the person turns it on. */
                <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:px-5">
                  <RowTile Icon={Sunrise} tile="bg-info-soft text-info" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">My day email, weekdays 08:40</span>
                  <Switch
                    checked={Boolean(prefs.alerts.myDayEmail)}
                    onCheckedChange={(v) =>
                      void save(
                        { alerts: { myDayEmail: v } },
                        { text: `My day email ${v ? 'on' : 'off'}`, patch: { alerts: { myDayEmail: !v } } },
                      )
                    }
                    aria-label="My day email"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </ProfileCard>
  );
}
