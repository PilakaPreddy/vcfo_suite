'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, Settings2 } from 'lucide-react';
import { ComposeRecipientPicker } from '@/components/email/ComposeRecipientPicker';
import { ComposeTemplatePanel } from '@/components/email/ComposeTemplatePanel';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { useApp } from '@/context/AppContext';
import { roleSettingsPath } from '@/lib/auth-routes';
import { emailBrandingLabel, type EmailTemplateDto } from '@/lib/email/compose-branding';
import {
  matchDirectoryPersonByToParam,
  type DirectoryPerson,
} from '@/lib/email/directory-filter';
import { isEmailAddress } from '@/lib/email/recipient-input';
import { isFirmWideAdmin } from '@/lib/auth';
import { toastError, toastSuccess, errorMessage } from '@/lib/toast-errors';
import { EmailSettingsDialog, type SignatureState } from '@/views/staff/mail/EmailSettingsDialog';
import { MailAttachments, type VaultAttachment } from '@/views/staff/mail/MailAttachments';
import { useMailGroups } from '@/views/staff/mail/use-mail-groups';
import { fillMergeFields, firstName, mergeValuesFor } from '@/views/staff/mail/merge-fields';
import { checklist } from '@/data/checklist';

type Props = {
  path: string;
};

/**
 * One labelled row of the compose card (prototype `EmailScreen` `Line`): the label sits in a
 * narrow column on the left and the field fills the rest, with a hairline under the row.
 */
function Line({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-line-soft px-4 py-2 md:grid-cols-[90px_minmax(0,1fr)] md:px-5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-muted">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function ComposeMail({ path }: Props) {
  const { user, engagements, getStateForEngagement } = useApp();
  const settingsHref = user ? `${roleSettingsPath(user.role)}#email` : '/login';

  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [connected, setConnected] = useState(false);
  const [msEmail, setMsEmail] = useState<string | undefined>();
  const [loadingStatus, setLoadingStatus] = useState(true);
  /** K-40: the signature the send route adds under the message when it is on. */
  const [signature, setSignature] = useState<SignatureState>({ signatureEnabled: false, signatureText: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mailGroups = useMailGroups();
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultAttachment[]>([]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** Typed addresses outside the directory (a CA, a bank, a prospect). */
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<EmailTemplateDto | null>(null);
  /** Recipients of the last message sent from this page, shown beside a "Sent" chip. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStatus(true);
      try {
        const res = await fetch('/api/outlook');
        const json = (await res.json()) as {
          configured?: boolean;
          connected?: boolean;
          msEmail?: string;
          signatureEnabled?: boolean;
          signatureText?: string | null;
        };
        if (cancelled) return;
        setConfigured(json.configured !== false);
        setConnected(Boolean(json.connected));
        setMsEmail(json.msEmail);
        setSignature({
          signatureEnabled: Boolean(json.signatureEnabled),
          signatureText: json.signatureText ?? null,
        });
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPeople(true);
      try {
        const res = await fetch('/api/outlook/directory');
        const json = (await res.json()) as { people?: DirectoryPerson[]; error?: string };
        if (!res.ok) throw new Error(json.error || 'directory_failed');
        if (!cancelled) {
          const list = json.people ?? [];
          setPeople(list);
          const to =
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('to')
              : null;
          const selectedId = matchDirectoryPersonByToParam(list, to);
          if (selectedId) setSelected(new Set([selectedId]));
          else if (to && isEmailAddress(to)) setCustomEmails([to.trim().toLowerCase()]);
        }
      } catch (err) {
        if (!cancelled) toastError('Could not load people', errorMessage(err));
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefill from Ask VCFO's "Draft reminder" (?subject=&body=). Nothing is sent
  // until the user presses Send.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const presetSubject = params.get('subject');
    const presetBody = params.get('body');
    if (presetSubject) setSubject(presetSubject.slice(0, 300));
    if (presetBody) setBody(presetBody.slice(0, 5000));
  }, []);

  const signatureOn = Boolean(signature.signatureEnabled && signature.signatureText?.trim());

  const selectedPeople = useMemo(
    () => people.filter((p) => selected.has(p.userId)),
    [people, selected],
  );

  function toggle(userId: string) {
    setSentTo(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  /** The company's current step: the first checklist step that is neither done nor not needed. */
  function currentStepOf(engagementId: string): string | null {
    const engagement = engagements.find((e) => e.id === engagementId);
    if (!engagement) return null;
    const state = getStateForEngagement(engagement);
    const open = checklist.find((item) => {
      const status = state[item.id]?.status ?? 'not-started';
      return status !== 'completed' && status !== 'not-applicable';
    });
    return open?.title ?? null;
  }

  /**
   * A picked template fills {client}, {name} and {step} from the first client contact in To.
   * With the server signature off, the sender's first name goes under the message, as in the
   * prototype; with it on, the send route adds the saved signature instead.
   */
  function applyTemplate(template: EmailTemplateDto) {
    setSentTo(null);
    setAppliedTemplate(template);
    const values = mergeValuesFor(selectedPeople, currentStepOf);
    const signOff = !signatureOn && user?.name ? `\n${firstName(user.name)}` : '';
    setSubject(fillMergeFields(template.subject, values));
    setBody(`${fillMergeFields(template.bodyText, values)}${signOff}`);
  }

  /** Clear the draft. Nothing has been sent, so nothing is lost on the server. */
  function discard() {
    setSentTo(null);
    setSubject('');
    setBody('');
    setSelected(new Set());
    setCustomEmails([]);
    setAppliedTemplate(null);
    setSelectedGroupIds(new Set());
    setFiles([]);
    setVaultDocs([]);
  }

  function toggleGroup(groupId: string) {
    setSentTo(null);
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function send() {
    const to = [...selectedPeople.map((p) => p.email), ...customEmails];
    const groupIds = [...selectedGroupIds].filter((id) => mailGroups.groups.some((g) => g.id === id));
    const groupNames = mailGroups.groups.filter((g) => selectedGroupIds.has(g.id)).map((g) => g.name);
    if (to.length === 0 && groupIds.length === 0) {
      toastError('Pick a recipient', 'Choose someone in To, or type an email address.');
      return;
    }
    if (!subject.trim()) {
      toastError('Subject required', 'Add a subject before sending.');
      return;
    }
    if (!body.trim()) {
      toastError('Message required', 'Write a message before sending.');
      return;
    }
    setSending(true);
    try {
      const payload = {
        to,
        groupIds: groupIds.length > 0 ? groupIds : undefined,
        subject: subject.trim(),
        text: body,
        branding: appliedTemplate?.branding ?? 'plain',
        templateId: appliedTemplate?.id,
        documentIds: vaultDocs.length > 0 ? vaultDocs.map((d) => d.id) : undefined,
      };
      let request: RequestInit;
      if (files.length > 0) {
        // Files from this computer go as multipart; the same JSON rides in `payload`.
        const form = new FormData();
        form.append('payload', JSON.stringify(payload));
        for (const f of files) form.append('files', f, f.name);
        request = { method: 'POST', body: form };
      } else {
        request = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        };
      }
      const res = await fetch('/api/outlook/send', request);
      const json = (await res.json()) as { ok?: boolean; error?: string; from?: string };
      if (!res.ok || json.ok === false) {
        if (res.status === 409 || json.error === 'outlook_not_connected') {
          toastError('Connect Outlook', 'Link your mailbox in Settings, then send again.');
          return;
        }
        throw new Error(json.error ?? 'send_failed');
      }
      const sentLabel = [...to, ...groupNames].join(', ');
      toastSuccess('Email sent', `From ${json.from ?? 'your Outlook mailbox'} to ${sentLabel}`);
      discard();
      setSentTo(sentLabel);
    } catch (err) {
      toastError("Email didn't send", errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  // K-40: the prototype's head line "Signature from Outlook · server-side signature on". The
  // send route adds the saved signature under the message when it is on.
  const signatureLine =
    !loadingStatus && connected
      ? signatureOn
        ? 'Signature from Outlook · server-side signature on'
        : 'Signature from Outlook · server-side signature off'
      : null;
  const hasRecipient = selected.size > 0 || customEmails.length > 0 || selectedGroupIds.size > 0;

  const status = loadingStatus
    ? null
    : connected
      ? { word: 'Outlook connected', tone: 'ok' as const }
      : configured
        ? { word: 'Outlook not connected', tone: 'warn' as const }
        : { word: 'Outlook not configured', tone: 'idle' as const };

  const fromText = loadingStatus
    ? 'Checking Outlook…'
    : connected && msEmail
      ? msEmail
      : configured
        ? 'Outlook not connected'
        : 'Outlook not configured (Azure app)';

  return (
    <PageTransition>
      <SEO
        title="Send email — VCFO Suite"
        description="Write and send mail from your connected Outlook mailbox."
        path={path}
      />

      <div className="grid gap-5">
        {/* Plain page head (R-02, R-09: no back link): title, the Outlook status chip and the settings link. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_240px]">
            <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Email</h1>
            {signatureLine ? <p className="text-[13.5px] text-ink-muted">{signatureLine}</p> : null}
          </div>
          {status ? <Chip tone={status.tone}>{status.word}</Chip> : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>
            <Settings2 aria-hidden /> Settings
          </Button>
          <Link
            href={settingsHref}
            className="text-[13px] font-medium text-brand-text hover:underline"
          >
            {/* Not a second Settings: this opens the Outlook mailbox page under Profile. */}
            Outlook mailbox ›
          </Link>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="surface min-w-0 overflow-hidden" aria-label="New message">
            <Line label="From" htmlFor="mail-from">
              <input
                id="mail-from"
                readOnly
                value={fromText}
                className="h-8 w-full truncate bg-transparent text-[14px] text-ink outline-none"
              />
            </Line>
            <Line label="To" htmlFor="mail-to-search">
              <ComposeRecipientPicker
                bare
                people={people}
                loading={loadingPeople}
                selected={selected}
                onToggle={toggle}
                onApplyAutoFill={(removeIds, addIds) => {
                  setSentTo(null);
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const id of removeIds) next.delete(id);
                    for (const id of addIds) next.add(id);
                    return next;
                  });
                }}
                customEmails={customEmails}
                onAddCustomEmails={(emails) =>
                  setCustomEmails((prev) => [...prev, ...emails.filter((e) => !prev.includes(e))])
                }
                onRemoveCustomEmail={(email) =>
                  setCustomEmails((prev) => prev.filter((e) => e !== email))
                }
                groups={mailGroups.groups}
                selectedGroupIds={selectedGroupIds}
                onToggleGroup={toggleGroup}
              />
            </Line>
            <Line label="Subject" htmlFor="mail-subject">
              <input
                id="mail-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={500}
                placeholder="Subject"
                className="h-8 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
              />
            </Line>
            <div className="px-4 pb-4 pt-3 md:px-5">
              <textarea
                id="mail-body"
                aria-label="Message"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={20000}
                placeholder="Message"
                className="block min-h-[220px] w-full resize-y bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            <div className="border-t border-line-soft px-4 py-2 md:px-5">
              <MailAttachments
                files={files}
                onFilesChange={setFiles}
                vaultDocs={vaultDocs}
                onVaultDocsChange={setVaultDocs}
                disabled={sending}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5">
              {appliedTemplate ? (
                <>
                  <Tag tone="prog">Template · {appliedTemplate.name}</Tag>
                  <Tag>{emailBrandingLabel(appliedTemplate.branding)}</Tag>
                </>
              ) : null}
              {sentTo ? (
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
                  <Chip tone="ok">Sent</Chip>
                  <span className="truncate">{sentTo}</span>
                </span>
              ) : null}
              {!loadingStatus && configured && !connected ? (
                <Link
                  href={settingsHref}
                  className="text-[13px] font-medium text-brand-text hover:underline"
                >
                  Connect Outlook
                </Link>
              ) : null}
              <span className="ml-auto flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={discard} disabled={sending}>
                  Discard
                </Button>
                <Button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !connected || !hasRecipient || !subject.trim()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Sending
                    </>
                  ) : (
                    'Send'
                  )}
                </Button>
              </span>
            </div>
          </section>

          <ComposeTemplatePanel
            selectedId={appliedTemplate?.id ?? null}
            onApply={applyTemplate}
            onClear={() => setAppliedTemplate(null)}
          />
        </div>
      </div>

      <EmailSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        connected={connected}
        signature={signature}
        onSignatureSaved={setSignature}
        groups={mailGroups.groups}
        groupsLoading={mailGroups.loading}
        canShare={isFirmWideAdmin(user?.role)}
        onCreateGroup={mailGroups.create}
        onUpdateGroup={mailGroups.update}
        onDeleteGroup={mailGroups.remove}
      />
    </PageTransition>
  );
}
