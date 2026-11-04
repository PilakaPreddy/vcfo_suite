import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth';
import { headers } from 'next/headers';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { authConfigBase } from '@/auth/config.base';
import { systemCheckSignInPassword } from '@/db/repositories/profiles';
import {
  systemCreateUserSession,
  systemIsSessionActive,
  systemRevokeSession,
} from '@/db/repositories/user-sessions';
import { checkTotpCode } from '@/lib/totp/check';
import { MICROSOFT_PROVIDER_ID, microsoftEmailOf, microsoftProviders, onMicrosoftSignInError } from '@/auth/microsoft';
import { systemResolveExternalSignIn } from '@/db/repositories/sign-in-links';
import { systemRecordSignIn } from '@/db/repositories/client-audit';
import { cityFromHeaders, deviceLabel } from '@/lib/sign-in-device';

/**
 * Two-step sign-in outcomes (G-25). Each reaches the browser as `code` on the
 * `signIn()` result. They are only thrown after the password was accepted, so
 * they never say whether an email exists.
 */
class TwoStepRequired extends CredentialsSignin {
  code = 'two_step_required';
}
class TwoStepInvalid extends CredentialsSignin {
  code = 'two_step_invalid';
}
class TwoStepLocked extends CredentialsSignin {
  code = 'two_step_locked';
}

/** The first address in X-Forwarded-For (App Runner and the tunnel set it), else X-Real-IP. */
function clientIp(request: Request | undefined): string | null {
  const fwd = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request?.headers.get('x-real-ip')?.trim() || null;
}

/**
 * Auth.js (NextAuth v5) — email/password now, SSO later.
 *
 * Replaces Supabase Auth. The Credentials provider checks a bcrypt hash in
 * the `profiles` table. Role + scoping ids (internId, clientId) are baked into
 * the JWT/session so the repository layer can scope every query without an
 * extra DB round-trip.
 *
 * Two-step sign-in (G-25): when `profiles.totp_enabled_at` is set, `authorize`
 * also needs a valid `otp` field (RFC 6238, see `src/lib/totp/`). The sign-in
 * screen learns whether to ask for one from `POST /api/auth/two-step`.
 *
 * Devices (G-25): each sign-in makes a `user_sessions` row and the JWT carries
 * its id as `sid`. A revoked row clears the token here and fails
 * `currentContext` in `guards.ts`; signing out revokes the row.
 *
 * To add SSO later: add an OAuth/SAML provider here (e.g. WorkOS, Okta,
 * Azure AD). The session shape below stays the same, so nothing downstream
 * changes.
 *
 * RUNTIME: this module is Node-only — it imports bcrypt and the Postgres pool.
 * Middleware must NOT import it (that is what broke the Edge bundle with
 * "Native module not found: node:util/types"); it imports '@/auth/edge'
 * instead. Session/JWT callbacks live in '@/auth/config.base' so both runtimes
 * share exactly one copy.
 */
const credentialsProvider = Credentials({
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
    otp: { label: 'Code', type: 'text' },
  },
  async authorize(creds, request) {
    const row = await systemCheckSignInPassword(String(creds?.email ?? ''), String(creds?.password ?? ''));
    if (!row) return null;

    if (row.twoStepOn) {
      const otp = String(creds?.otp ?? '').trim();
      if (!otp) throw new TwoStepRequired();
      const check = checkTotpCode(row.id, row.totpSecretEnc, otp);
      if (check === 'locked') throw new TwoStepLocked();
      if (check === 'invalid') throw new TwoStepInvalid();
    }

    const userAgent = request?.headers.get('user-agent');
    // C-851: the sign-in city when a CDN in front of the app sends a geo header.
    const city = cityFromHeaders(request?.headers);
    const sid = await systemCreateUserSession({
      userId: row.id,
      userAgent,
      ip: clientIp(request),
      city,
    });
    // C-787: the sign-in goes on the audit log (a client's on its company's). Not awaited, never throws.
    void systemRecordSignIn({
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      clientId: row.clientId,
      device: deviceLabel(userAgent),
      city,
      method: row.twoStepOn ? 'Password and code' : 'Password',
    });

    return {
      id: row.id,
      email: row.email,
      name: row.name ?? undefined,
      role: row.role,
      internId: row.internId ?? undefined,
      clientId: row.clientId ?? undefined,
      hasAvatar: Boolean(row.avatarObjectKey),
      avatarVersion: row.updatedAt.getTime(),
      sid: sid ?? undefined,
    };
  },
});

/**
 * Auth.js error logger: the library's own format, plus the M7 hook that drops a refused
 * Microsoft client secret from the cache.
 */
function logAuthError(error: Error): void {
  const name = (error as { type?: string }).type ?? error.name;
  console.error(`[auth][error] ${name}: ${error.message}`);
  const cause = (error as { cause?: { err?: unknown } }).cause;
  if (cause && typeof cause === 'object' && cause.err instanceof Error) console.error('[auth][cause]:', cause.err.stack);
  else if (error.stack) console.error(error.stack.replace(/.*/, '').substring(1));
  onMicrosoftSignInError(error);
}

const authConfig = {
  ...authConfigBase,
  logger: { error: logAuthError },
  events: {
    async signOut(message) {
      const token = 'token' in message ? message.token : null;
      if (typeof token?.sid === 'string' && typeof token.sub === 'string') {
        await systemRevokeSession(token.sid, token.sub);
      }
    },
  },
  callbacks: {
    ...authConfigBase.callbacks,
    /**
     * S-650: a Microsoft sign-in passes only when its email (or an earlier link) names an existing,
     * active staff profile. Otherwise the person goes back to the sign-in page with an error code.
     */
    async signIn({ account, user, profile }) {
      if (account?.provider !== MICROSOFT_PROVIDER_ID) return true;
      const result = await systemResolveExternalSignIn({
        provider: MICROSOFT_PROVIDER_ID,
        subject: account.providerAccountId,
        email: microsoftEmailOf(profile as Record<string, unknown> | undefined, user?.email),
        link: false,
      });
      return 'reason' in result ? `/login?error=microsoft_${result.reason}` : true;
    },
    async jwt({ token, user, account, profile }) {
      if (user && account?.provider === MICROSOFT_PROVIDER_ID) {
        // Map the Microsoft identity onto the VCFO profile and make (or touch) the link.
        const result = await systemResolveExternalSignIn({
          provider: MICROSOFT_PROVIDER_ID,
          subject: account.providerAccountId,
          email: microsoftEmailOf(profile as Record<string, unknown> | undefined, user.email),
          link: true,
        });
        if (!('profile' in result)) return null;
        const p = result.profile;
        // C-787, C-851: the request headers, when the callback runs inside the Auth.js route.
        const h = await Promise.resolve()
          .then(() => headers())
          .catch(() => null);
        const userAgent = h?.get('user-agent') ?? null;
        const city = cityFromHeaders(h);
        const sid = await systemCreateUserSession({ userId: p.id, userAgent, ip: null, city });
        void systemRecordSignIn({
          userId: p.id,
          email: p.email,
          name: p.name,
          role: p.role,
          clientId: p.clientId,
          device: deviceLabel(userAgent),
          city,
          method: 'Microsoft',
        });
        return {
          sub: p.id,
          name: p.name ?? undefined,
          email: p.email,
          role: p.role,
          internId: p.internId ?? undefined,
          clientId: p.clientId ?? undefined,
          hasAvatar: Boolean(p.avatarObjectKey),
          avatarVersion: p.updatedAt.getTime(),
          ...(sid ? { sid } : {}),
        };
      }
      if (user) {
        const u = user as {
          role?: string;
          internId?: string;
          clientId?: string;
          hasAvatar?: boolean;
          avatarVersion?: number;
          sid?: string;
        };
        token.role = u.role;
        token.internId = u.internId;
        token.clientId = u.clientId;
        token.hasAvatar = Boolean(u.hasAvatar);
        token.avatarVersion = u.avatarVersion;
        if (u.sid) token.sid = u.sid;
        return token;
      }

      // Keep JWT claims aligned with profiles (Node runtime only).
      // If the profile was deleted/reseeded, clear the token so middleware + APIs
      // both treat the user as signed out (avoids /app shell with 401 APIs).
      if (token.sub) {
        const sid = typeof token.sid === 'string' ? token.sid : null;
        const rowQuery = db
          .select({
            role: profiles.role,
            internId: profiles.internId,
            clientId: profiles.clientId,
            status: profiles.status,
            name: profiles.name,
            email: profiles.email,
            avatarObjectKey: profiles.avatarObjectKey,
            updatedAt: profiles.updatedAt,
          })
          .from(profiles)
          .where(eq(profiles.id, token.sub))
          .limit(1);
        const [[row], sessionActive] = await Promise.all([
          rowQuery,
          sid ? systemIsSessionActive(sid, token.sub) : Promise.resolve(true),
        ]);
        // A device signed out from Profile: clear the token like a deleted profile.
        if (!sessionActive) {
          return {};
        }
        if (!row || row.status !== 'active') {
          return {};
        }
        if (row.role === 'intern' && !row.internId?.trim()) {
          return {};
        }
        token.role = row.role;
        token.internId = row.internId ?? undefined;
        token.clientId = row.clientId ?? undefined;
        token.name = row.name ?? undefined;
        token.email = row.email;
        token.hasAvatar = Boolean(row.avatarObjectKey);
        token.avatarVersion = row.updatedAt.getTime();
      }
      return token;
    },
    async session({ session, token }) {
      if (!token?.sub || !token.role) {
        // Force clients to treat this as signed-out.
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      if (session.user) {
        session.user.id = token.sub as string;
        if (typeof token.name === 'string') session.user.name = token.name;
        if (typeof token.email === 'string') session.user.email = token.email;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { internId?: string }).internId = token.internId as
          | string
          | undefined;
        (session.user as { clientId?: string }).clientId = token.clientId as
          | string
          | undefined;
        (session.user as { hasAvatar?: boolean }).hasAvatar = Boolean(token.hasAvatar);
        (session.user as { avatarVersion?: number }).avatarVersion =
          typeof token.avatarVersion === 'number' ? token.avatarVersion : undefined;
        // The device id; `currentContext` reads it to check the row is not revoked.
        (session.user as { sid?: string }).sid = typeof token.sid === 'string' ? token.sid : undefined;
      }
      return session;
    },
  },
} satisfies Omit<NextAuthConfig, 'providers'>;

/**
 * The config is built per request (Auth.js lazy init) so the Microsoft client secret can be
 * read from Secrets Manager at runtime and a rotation needs no redeploy (M7). The provider
 * list is the only part that changes; everything else is the fixed object above.
 *
 * S-650: Microsoft Entra ID, only when its env vars are set. It links to an existing profile
 * by email and never creates one (see `signIn` and `jwt` above, and `src/auth/microsoft.ts`).
 */
export const { handlers, auth } = NextAuth(
  async (): Promise<NextAuthConfig> => ({
    ...authConfig,
    providers: [credentialsProvider, ...(await microsoftProviders())],
  }),
);
