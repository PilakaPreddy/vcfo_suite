'use client';

import { RouteErrorPanel } from '@/components/shell/RouteErrorPanel';

export default function ClientIncorporationError({
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
      logTag="client/incorporation"
      title="Couldn't load incorporation"
      body="A temporary error occurred. Try reloading — if it keeps happening, contact your firm."
      backHref="/app/client"
      backLabel="Back to home"
    />
  );
}
