'use client';

/**
 * The Team section (C-0027, R-42): the SBC team card on top and the client's people
 * in a large card below, with the invite, resend, cancel and substitute / hand-off
 * flows. Used by the Team page (`/app/client/team`) and by the Team tab on the
 * Profile and Settings page, so both share one data source and one set of dialogs.
 * SBC people come from the shell (`usePortal().shell.team`); the client's people and
 * pending invites from `/api/client/team`; hand-off and substitute through the
 * existing `/api/engagements/:id/clients/substitute`.
 */
import { MessageCircle, RefreshCw, UserRoundCog, Video, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { usePortal, usePortalOptional } from '../../PortalProvider';
import type { ClientPortalContact } from '@/lib/client-portal/types';
import type { ClientTeamView } from '@/db/repositories/client-team';
import {
  CardHead,
  CloseBtn,
  Dialog,
  Empty,
  P,
  SChip,
  STag,
  Seg,
  Svg,
  Tile,
  api,
  SELF_TINT,
  avatarTint,
  contactHref,
  copyText,
  initialsOf,
  makeSetPasswordToken,
  makeTempPassword,
  setPasswordLink,
  prettyPhone,
  shortDate,
  useSkeleton,
} from './common';
import '../../css/team-00-contract.css';
import '../../css/team-team.css';

const TEAM_KEY = ['client-portal', 'team'] as const;

/** "2 Sep 2026" for the Since column. */
function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace('Sept', 'Sep');
}
/** The roles the invite form offers (C-898); stored as the person's designation. */
const CLIENT_ROLES = ['Director', 'Finance', 'Operations', 'Company secretary', 'Other'];
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Row = {
  key: string;
  k: 'p' | 'm' | 'i';
  name: string;
  email: string;
  when: string;
  /** The Since column: the full date the person joined or the invite went out. */
  date: string;
  /** Role at the company (`profiles.designation`), or null. */
  designation: string | null;
  you: boolean;
  userId?: string;
  inviteId?: string;
};

/**
 * The client's people and invites (`/api/client/team`), shared by the Team page and Settings.
 * Staff viewing one engagement (`StaffPortalProvider`) read that engagement's team.
 */
export function useClientTeam() {
  const viewing = usePortalOptional()?.engagementId;
  return useQuery({
    queryKey: viewing ? [...TEAM_KEY, viewing] : TEAM_KEY,
    queryFn: () => api<ClientTeamView>(viewing ? `/api/client/team?engagement=${encodeURIComponent(viewing)}` : '/api/client/team'),
  });
}

export function TeamSection() {
  const { shell, toast, openChat, engagementId: staffView } = usePortal();
  const qc = useQueryClient();
  const q = useClientTeam();
  const sk = useSkeleton(q.isLoading);
  const [tab, setTab] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [subFor, setSubFor] = useState<Row | null>(null);

  const company = shell?.companyShort ?? 'your company';
  const isPrimary = q.data?.isPrimary ?? false;

  const rows: Row[] = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    return [
      ...d.people.map<Row>((p) => ({
        key: p.userId,
        k: p.role === 'primary' ? 'p' : 'm',
        name: p.name,
        email: p.email,
        when: `Since ${shortDate(p.since)}`,
        date: fullDate(p.since),
        designation: p.designation,
        you: p.you,
        userId: p.userId,
      })),
      ...d.invites.map<Row>((i) => ({
        key: i.id,
        k: 'i',
        name: i.name,
        email: i.email,
        when: `Sent ${shortDate(i.sentAt)}`,
        date: fullDate(i.sentAt),
        designation: i.designation,
        you: false,
        inviteId: i.id,
      })),
    ];
  }, [q.data]);

  const TABS: Array<[string, Row['k'] | null]> = [
    ['All', null],
    ['Primary', 'p'],
    ['Members', 'm'],
    ['Invited', 'i'],
  ];
  const key = TABS[tab][1];
  const shown = rows.filter((r) => !key || r.k === key);

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ team: ClientTeamView; email?: string }>('/api/client/team', { method: 'POST', json: body }),
    onSuccess: (d) => qc.setQueryData(TEAM_KEY, d.team),
  });

  const openInvite = () => {
    if (!isPrimary) {
      toast('Only the Primary contact can invite');
      return;
    }
    setInviteOpen(true);
  };

  const resend = (r: Row) => {
    const pw = makeTempPassword();
    // C-899: a fresh set-password link goes out with the resend.
    act.mutate(
      { action: 'resend', inviteId: r.inviteId, tempPassword: pw, setPasswordToken: makeSetPasswordToken() },
      {
        onSuccess: (d) => {
          toast(d.email === 'sent' ? `Invite sent again to ${r.email}` : `New sign-in ready for ${r.email} · email not sent`);
        },
        onError: (e) => toast(e instanceof Error ? e.message : 'Could not resend the invite'),
      },
    );
  };
  const cancel = (r: Row) => {
    act.mutate(
      { action: 'cancel', inviteId: r.inviteId },
      {
        onSuccess: () =>
          toast(`Invite for ${r.name} cancelled`, {
            undo: () => act.mutate({ action: 'restore', inviteId: r.inviteId }),
          }),
        onError: (e) => toast(e instanceof Error ? e.message : 'Could not cancel the invite'),
      },
    );
  };

  const team: ClientPortalContact[] = shell?.team ?? [];
  const access = (r: Row) => (r.k === 'p' ? <SChip tone="prog">Primary</SChip> : r.k === 'i' ? <SChip tone="warn">Invite sent</SChip> : <SChip tone="idle">Member</SChip>);

  return (
    <div className="tp-team tb-team">
      {/* C-0028: one card for the SBC team */}
      <section className="sx-card" aria-labelledby="tm-sbc">
        <CardHead id="tm-sbc" d={P.users} tone="violet" title={`${company}’s SBC team`} />
        <div>
          {!shell
            ? [0, 1, 2].map((i) => (
                <div key={i} className="sx-row">
                  <span className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  <span style={{ flex: 1 }}>
                    <span className="sk" style={{ display: 'block', width: '30%', height: 12 }} />
                    <span className="sk" style={{ display: 'block', width: '45%', height: 10, marginTop: 6 }} />
                  </span>
                </div>
              ))
            : team.length === 0
              ? <Empty>No SBC team assigned yet</Empty>
              : team.map((p) => <SbcRow key={p.id} p={p} />)}
        </div>
      </section>

      <section className="sx-card" aria-labelledby="tm-people">
        <CardHead id="tm-people" d={P.users} tone="violet" title={`People from ${company}`} meta={q.data ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : undefined}>
          <Seg
            tabs={TABS.map(([l, k]) => ({ label: l, cnt: rows.filter((r) => !k || r.k === k).length }))}
            active={tab}
            onPick={setTab}
            label="Filter people"
            grid={false}
          />
          {/* Inviting is the client's; staff add people from the project's own screens. */}
          {staffView ? null : (
            <button
              type="button"
              className="btn btn-n btn-sm"
              data-tip={isPrimary ? undefined : 'Only the Primary contact can invite'}
              aria-disabled={!isPrimary}
              onClick={openInvite}
            >
              Invite
            </button>
          )}
        </CardHead>
        {q.isLoading ? (
          sk ? (
            <div style={{ padding: '8px 16px 16px', display: 'grid', gap: 8 }} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="sk" style={{ display: 'block', height: 44 }} />
              ))}
            </div>
          ) : null
        ) : q.isError ? (
          <Empty
            role="alert"
            action={
              <button type="button" className="btn btn-o btn-sm" onClick={() => void q.refetch()}>
                Try again
              </button>
            }
          >
            Could not load the team
          </Empty>
        ) : shown.length === 0 ? (
          <div className="tb-faint" role="status">
            {tab === 3 ? 'No pending invites' : 'No people'}
          </div>
        ) : (
          <div className="tb-tw">
            <table className="sx-t1 tb-people">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" style={{ width: 120 }}>
                    Role
                  </th>
                  <th scope="col" className="tb-d">
                    Email
                  </th>
                  <th scope="col" className="tb-d">
                    Since
                  </th>
                  <th scope="col" style={{ width: 124 }}>
                    Access
                  </th>
                  <th scope="col" style={{ width: 150 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const av =
                    r.k === 'i'
                      ? { background: 'oklch(var(--upcoming-soft))', color: 'oklch(var(--upcoming))' }
                      : r.you
                        ? SELF_TINT
                        : avatarTint(r.key);
                  return (
                    <tr key={r.key}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                          <span className="av" style={{ width: 24, height: 24, fontSize: 10, ...av }}>
                            {initialsOf(r.name).slice(0, 1)}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 500 }}>{r.name}</span>
                            {r.you ? <span style={{ marginLeft: 6, fontSize: 12, color: 'oklch(var(--ink-muted))' }}>you</span> : null}
                            <span className="cap tb-m tb-flex" style={{ overflowWrap: 'anywhere' }}>
                              {r.email} · {r.when}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td style={{ width: 120, color: 'oklch(var(--ink-2))' }}>{r.designation ?? <span style={{ color: 'oklch(var(--ink-faint))' }}>-</span>}</td>
                      <td className="tb-d" style={{ color: 'oklch(var(--ink-2))', overflowWrap: 'anywhere' }}>
                        {r.email}
                      </td>
                      <td className="tb-d" style={{ width: 110, whiteSpace: 'nowrap', fontSize: 12.5, color: 'oklch(var(--ink-muted))' }}>
                        {r.when}
                      </td>
                      <td style={{ width: 124 }}>{access(r)}</td>
                      <td style={{ width: 150 }}>
                        <span style={{ display: 'inline-flex', gap: 8 }}>
                          {r.k === 'i' ? (
                            isPrimary ? (
                              <>
                                <button
                                  type="button"
                                  className="ibtn ghost"
                                  aria-label={`Resend invite to ${r.email}`}
                                  data-tip={`Resend invite to ${r.email}`}
                                  disabled={act.isPending}
                                  onClick={() => resend(r)}
                                >
                                  <RefreshCw size={15} strokeWidth={1.6} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  className="ibtn ghost"
                                  aria-label="Cancel invite"
                                  data-tip="Cancel invite"
                                  disabled={act.isPending}
                                  onClick={() => cancel(r)}
                                >
                                  <X size={15} strokeWidth={1.6} aria-hidden />
                                </button>
                              </>
                            ) : null
                          ) : r.you ? (
                            <button type="button" className="btn btn-o btn-sm" aria-label="Hand off your seat" onClick={() => setSubFor(r)}>
                              Hand off
                            </button>
                          ) : isPrimary ? (
                            <button
                              type="button"
                              className="ibtn ghost"
                              aria-label={`Substitute ${r.name}`}
                              data-tip={`Substitute ${r.name}`}
                              onClick={() => setSubFor(r)}
                            >
                              <UserRoundCog size={15} strokeWidth={1.6} aria-hidden />
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <footer className="tb-pager">
              <span>
                1–{shown.length} of {shown.length}
              </span>
            </footer>
          </div>
        )}
      </section>

      {inviteOpen ? (
        <InviteDialog
          company={company}
          onClose={() => setInviteOpen(false)}
          onSend={(name, email, pw, designation, setPasswordToken) =>
            new Promise<void>((resolve, reject) => {
              act.mutate(
                { action: 'invite', name, email, tempPassword: pw, designation, setPasswordToken },
                {
                  onSuccess: (d) => {
                    const inv = (d as unknown as { invite?: { id: string } }).invite;
                    setInviteOpen(false);
                    setTab(3);
                    toast(
                      d.email === 'attached'
                        ? `${name} now has access to ${company}`
                        : d.email === 'sent'
                          ? `Invite sent to ${email}`
                          : `Invite ready for ${email} · email not sent, share the sign-in yourself`,
                      inv ? { undo: () => act.mutate({ action: 'cancel', inviteId: inv.id }) } : undefined,
                    );
                    resolve();
                  },
                  onError: (e) => reject(e),
                },
              );
            })
          }
        />
      ) : null}
      {subFor ? (
        <SubstituteDialog
          row={subFor}
          company={company}
          engagementId={q.data?.engagementId ?? shell?.engagementId ?? ''}
          onClose={() => setSubFor(null)}
          onDone={() => {
            setSubFor(null);
            void qc.invalidateQueries({ queryKey: TEAM_KEY });
          }}
          openChat={openChat}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** One SBC person: avatar, name, role tag, contact line and the four contact buttons (C-0026). */
function SbcRow({ p }: { p: ClientPortalContact }) {
  const { toast } = usePortal();
  const support = p.support || p.role === 'SBC help desk';
  const role = support ? 'Customer support' : p.role;
  /* The help desk name/email/phone come from CLIENT_SUPPORT_* env; when those are
     unset the row still reads as a person row (no repeated "Customer support",
     no missing contact line). */
  const name = support && /^customer support$/i.test(p.name.trim()) ? 'SBC help desk' : p.name;
  const line = support
    ? [p.email, prettyPhone(p.phoneE164)].filter(Boolean).join(' · ') || 'Contact details coming soon'
    : (p.email ?? '');
  const tint = support ? SELF_TINT : avatarTint(p.id);
  const btn = (kind: 'wa' | 'call' | 'email' | 'teams', label: string) => {
    const href = contactHref(kind, p);
    return {
      href: href ?? '#',
      target: href && (kind === 'wa' || kind === 'teams') ? '_blank' : undefined,
      rel: 'noopener noreferrer',
      'aria-label': `${label} ${p.name}`,
      'data-tip': label,
      onClick: (e: React.MouseEvent) => {
        if (!href) {
          e.preventDefault();
          toast(`${label} is not set up for ${p.name} yet`);
        }
      },
    };
  };
  return (
    <div className="sx-row tb-sbc">
      <span className="av" role="img" aria-label={`${p.name} photo`} style={{ width: 36, height: 36, fontSize: 12, ...tint, overflow: 'hidden' }}>
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        ) : (
          initialsOf(name).slice(0, 1)
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500 }}>{name}</span>
          <STag tone={support ? 'prog' : 'idle'}>{role}</STag>
        </span>
        <span className="cap tb-line" style={{ display: 'block', marginTop: 2 }}>
          {line}
        </span>
      </span>
      <span className="tb-contact">
        <a className="ibtn wa" {...btn('wa', 'WhatsApp')}>
          <MessageCircle size={15} strokeWidth={1.6} aria-hidden />
        </a>
        <a className="ibtn" {...btn('call', 'Call')}>
          <Svg d={P.call} size={15} sw={1.8} />
        </a>
        <a className="ibtn" {...btn('email', 'Email')}>
          <Svg d={P.mail} size={15} sw={1.8} />
        </a>
        <a className="ibtn" {...btn('teams', 'Teams')}>
          <Video size={15} strokeWidth={1.6} aria-hidden />
        </a>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Sign-in box: the set-password link is not built yet, so the one-off temporary password shows (DECISIONS). */
function SignInBox({ pw, email, label, token }: { pw: string; email: string; label: string; token?: string }) {
  const { toast } = usePortal();
  if (token) {
    // C-899: the invitee gets a set-password link by email; Copy puts the same link on the clipboard.
    return (
      <div className="fl">
        <span>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: '1.5px solid oklch(var(--line))' }}>
          <Tile d={P.link} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="rt" style={{ display: 'block' }}>
              Set-password link by email
            </span>
            <span className="cap">Expires in 7 days</span>
          </span>
          <button
            type="button"
            className="ibtn ghost"
            aria-label="Copy the set-password link"
            data-tip="Copy the link"
            onClick={async () => {
              const ok = await copyText(setPasswordLink(token));
              toast(ok ? 'Link copied · it works after you send the invite' : 'Could not copy the link');
            }}
          >
            <Svg d={P.copy} sw={1.8} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="fl">
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: '1.5px solid oklch(var(--line))' }}>
        <Tile d={P.link} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="rt" style={{ display: 'block' }}>
            Temporary password by email
          </span>
          <span className="cap idm">{pw}</span>
        </span>
        <button
          type="button"
          className="ibtn ghost"
          aria-label="Copy the sign-in"
          data-tip="Copy the sign-in"
          onClick={async () => {
            const ok = await copyText(
              `Sign in to VCFO Suite at ${window.location.origin}/login\nEmail: ${email || '(their work email)'}\nTemporary password: ${pw}`,
            );
            toast(ok ? 'Sign-in copied' : 'Could not copy — select the password instead');
          }}
        >
          <Svg d={P.copy} sw={1.8} />
        </button>
      </div>
    </div>
  );
}

function InviteDialog({
  company,
  onClose,
  onSend,
}: {
  company: string;
  onClose: () => void;
  onSend: (name: string, email: string, pw: string, designation: string | null, setPasswordToken: string) => Promise<void>;
}) {
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw] = useState(makeTempPassword);
  const [token] = useState(makeSetPasswordToken);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && EMAIL_OK.test(email.trim());
  const send = async () => {
    if (!valid) {
      setErr(!name.trim() ? 'Enter a name.' : 'Enter a valid work email.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onSend(name.trim(), email.trim(), pw, role || null, token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the invite');
      setBusy(false);
    }
  };
  return (
    <Dialog labelledBy="inv-t" width={420} onClose={onClose} tp="tp-team">
      <div className="dlg-h">
        <h2 id="inv-t" style={{ margin: 0 }}>
          Invite a colleague
        </h2>
        <CloseBtn onClick={onClose} />
      </div>
      <form
        className="dlg-b"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="fl">
          Name
          <input className="inp" value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label className="fl">
          Work email
          <input className="inp" type="email" value={email} placeholder="name@company.in" onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <label className="fl">
          Role
          <select className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Choose a role</option>
            {CLIENT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <SignInBox pw={pw} email={email.trim()} label="Sign-in" token={token} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'oklch(var(--ink-2))' }}>
          Access
          <SChip tone="idle">Member</SChip>
          <span className="cap">Sees everything on {company}. Cannot invite.</span>
        </div>
        {err ? (
          <div className="tb-err" role="alert">
            {err}
          </div>
        ) : null}
        <button type="submit" hidden />
      </form>
      <div className="dlg-f">
        <button type="button" className="btn btn-g" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-n" disabled={busy || !valid} onClick={() => void send()}>
          Send invite
        </button>
      </div>
    </Dialog>
  );
}

function SubstituteDialog({
  row,
  company,
  engagementId,
  onClose,
  onDone,
}: {
  row: Row;
  company: string;
  engagementId: string;
  onClose: () => void;
  onDone: () => void;
  openChat: (q?: string) => void;
}) {
  const { toast } = usePortal();
  const { signOut } = useApp();
  const self = row.you;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState(false);
  const [pw] = useState(makeTempPassword);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = name.trim().split(/\s+/)[0] || 'them';
  const valid = EMAIL_OK.test(email.trim()) && ok;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr('');
    try {
      const d = await api<{ substituted?: { actorLostAccess: boolean; name: string } }>(
        `/api/engagements/${encodeURIComponent(engagementId)}/clients/substitute`,
        {
          method: 'POST',
          json: { replaceUserId: row.userId, email: email.trim(), fullName: name.trim() || undefined, password: pw },
        },
      );
      const who = d.substituted?.name || name.trim() || email.trim();
      if (d.substituted?.actorLostAccess) {
        toast(`Handed off to ${who}`);
        setTimeout(() => void signOut(), 1200);
        return;
      }
      toast(`${row.name} replaced by ${who}`);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not complete the hand-off');
      setBusy(false);
    }
  };
  const titleId = 'ho-t';
  return (
    <Dialog labelledBy={titleId} width={500} onClose={onClose} tp="tp-team">
      <div className="dlg-h">
        <Tile d={P.swap} tone={self ? 'red' : 'violet'} />
        <h2 id={titleId} style={{ margin: 0 }}>
          {self ? 'Hand off your seat' : `Substitute ${row.name}`}
        </h2>
        <CloseBtn onClick={onClose} />
      </div>
      <form
        className="dlg-b"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="tb-seat">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="av" style={{ width: 30, height: 30, fontSize: 11, ...(self ? SELF_TINT : avatarTint(row.key)) }}>
              {initialsOf(row.name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="rt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
              <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.k === 'p' ? 'Primary' : 'Member'} · {company}
              </div>
            </div>
          </div>
          <span aria-hidden="true" style={{ color: 'oklch(var(--ink-faint))', fontSize: 18 }}>
            ›
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="av" style={{ width: 30, height: 30, fontSize: 11, ...SELF_TINT }}>
              {name.trim() ? initialsOf(name) : '?'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="rt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.trim() || 'New person'}</div>
              <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.k === 'p' ? 'New Primary' : 'New Member'}</div>
            </div>
          </div>
        </div>
        {self ? (
          <div className="tb-note bad" role="note">
            <Svg d={P.warn} size={16} />
            You lose access to {company} right after this.
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <label className="fl">
            Name
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          <label className="fl">
            Work email
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <SignInBox pw={pw} email={email.trim()} label={`Sign-in for ${first}`} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          {self ? 'I understand I will be signed out' : `I understand ${row.name} loses access`}
        </label>
        {err ? (
          <div className="tb-err" role="alert">
            {err}
          </div>
        ) : null}
        <button type="submit" hidden />
      </form>
      <div className="dlg-f">
        <button type="button" className="btn btn-g" onClick={onClose}>
          Cancel
        </button>
        {self ? (
          <button
            type="button"
            className="btn btn-n"
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            Hand off and leave
          </button>
        ) : (
          <button type="button" className="btn btn-n" disabled={!valid || busy} onClick={() => void submit()}>
            Substitute
          </button>
        )}
      </div>
    </Dialog>
  );
}
