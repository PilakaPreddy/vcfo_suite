'use client';

import { RouteErrorPanel } from '@/components/shell/RouteErrorPanel';

export default function AdminProjectStepError({
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
      logTag="admin/projects/[slug]/step/[stepId]"
      title="Couldn't load this step"
      body="A temporary error occurred. Try reloading — if it keeps happening, check your connection or try again later."
      backLabel="Go back"
    />
  );
}
