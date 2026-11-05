'use client';

import { RouteErrorPanel } from '@/components/shell/RouteErrorPanel';

export default function InternEngagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorPanel
      error={error}
      reset={reset}
      logTag="intern/engagements/[id]"
      title="Couldn't load this engagement"
      body="A temporary error occurred. Try reloading — if it keeps happening, contact your manager."
      backHref="/app/intern/clients"
      backLabel="Back to clients"
    />
  );
}
