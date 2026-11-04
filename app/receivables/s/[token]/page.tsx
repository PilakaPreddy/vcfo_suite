import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { optionalViewer } from '@/auth/guards';
import { systemOpenShareLink } from '@/db/repositories/receivables';
import { roleHomePath } from '@/lib/auth-routes';
import { pageMetadata } from '@/lib/shell/page-metadata';
import { sharePath } from '@/lib/receivables/share-wire';
import { SharedLinkForbidden, SharedLinkGone } from '@/views/receivables/shared/SharedNotice';
import { SharedView } from '@/views/receivables/shared/SharedView';

/** A shared view is never indexed and never sends its address (the token) on in a Referer header. */
export const metadata: Metadata = {
  ...pageMetadata('Shared receivables', 'A receivables view shared by SBC'),
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

const EDITORS = new Set(['super_admin', 'admin', 'manager']);

/**
 * /receivables/s/<token> — a shared receivables view (Phase 10 of docs/specs/receivables/PLAN.md).
 * The proxy lets every visitor through and this page applies the link's rule through
 * `systemOpenShareLink`: a signed-out visitor of a login or restricted link goes to the partner
 * login and comes back here, a signed-in person who may not see it gets a polite refusal, and an
 * unknown, revoked or expired link gets one "does not work" page.
 */
export default async function SharedReceivablesPage({ params }: Props) {
  const { token } = await params;
  const viewer = await optionalViewer();
  const out = await systemOpenShareLink(token, viewer);
  if (out.status === 'needs_login') redirect(`/receivables/login?next=${encodeURIComponent(sharePath(token))}`);
  if (out.status === 'not_found') return <SharedLinkGone signedIn={Boolean(viewer)} />;
  if (out.status === 'forbidden') return <SharedLinkForbidden email={viewer?.email ?? ''} token={token} />;
  const home = !viewer
    ? null
    : EDITORS.has(viewer.role)
      ? { href: '/receivables/manager?tab=links', label: 'Back to the manager' }
      : viewer.role === 'partner'
        ? { href: '/receivables', label: 'My invoices' }
        : { href: roleHomePath(viewer.role), label: 'Back to VCFO Suite' };
  return <SharedView view={out.view} token={token} home={home} />;
}
