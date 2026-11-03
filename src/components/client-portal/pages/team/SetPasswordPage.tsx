'use client';

/**
 * C-899: the set-password page an invitee opens from the invite email
 * (`/set-password/<token>`). It shows the email and the company for a good link, takes a new
 * password twice, and sends the person to sign in. A bad, used or expired link says so.
 * Data: `GET` and `POST /api/client/invite-password`.
 *
 * The receivables client partner login (Phase 8) reuses this page with its own token (from
 * `?token=`), its own API and its own sign-in page; the props default to the client invite.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SbcLogo } from '@/components/brand/SbcLogo';

export function SetPasswordPage({
  token: tokenProp,
  apiPath = '/api/client/invite-password',
  loginPath = '/login',
  invalidText = 'This link was used already or has expired. Ask the person who invited you to send the invite again.',
}: {
  /** The link token; read from the `[token]` route segment when not given. */
  token?: string;
  apiPath?: string;
  loginPath?: string;
  invalidText?: string;
} = {}) {
  const params = useParams();
  const token = tokenProp ?? String(params?.token ?? '');
  const router = useRouter();
  const [info, setInfo] = useState<{ email: string; companyName: string } | null | undefined>(undefined);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${apiPath}?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { email: string; companyName: string }) : null))
      .then((v) => live && setInfo(v))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [token, apiPath]);

  const submit = async () => {
    if (pw.length < 8) return setErr('Use at least 8 characters');
    if (pw !== pw2) return setErr('The two passwords do not match');
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const b = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!res.ok) throw new Error(b.error ?? 'Could not set the password');
      router.push(`${loginPath}?email=${encodeURIComponent(b.email ?? info?.email ?? '')}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set the password');
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-surface p-4">
      <div className="w-full max-w-[400px] rounded-md border-1.5 border-line bg-surface-raised p-6 shadow-tile">
        <SbcLogo variant="lockup" size={28} decorative />
        {info === undefined ? (
          <div className="mt-6 h-24 animate-pulse rounded-md bg-surface-sunken" aria-busy="true" />
        ) : info === null ? (
          <div className="mt-6 grid gap-3">
            <h1 className="m-0 text-[18px] font-medium text-ink">Link not valid</h1>
            <p className="m-0 text-[14px] text-ink-2">{invalidText}</p>
            <Button variant="secondary" onClick={() => router.push(loginPath)}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <form
            className="mt-6 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="m-0 text-[18px] font-medium text-ink">Set your password</h1>
            <p className="m-0 text-[13px] text-ink-muted">
              {info.email} · {info.companyName}
            </p>
            <label htmlFor="sp-new" className="grid gap-1.5 text-[13px] font-medium text-ink-2">
              New password
              <Input id="sp-new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label htmlFor="sp-again" className="grid gap-1.5 text-[13px] font-medium text-ink-2">
              Type it again
              <Input id="sp-again" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
            {err ? (
              <span role="alert" className="text-[13px] font-medium text-danger">
                {err}
              </span>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
