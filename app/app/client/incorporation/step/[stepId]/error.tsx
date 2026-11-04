'use client';

import { RouteErrorPanel } from '@/components/shell/RouteErrorPanel';

export default function InternStepError({
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
      logTag="intern/engagements/[id]/step/[stepId]"
      title="Couldn't load this step"
      body="A temporary error occurred. Try reloading or go back to the engagement."
      backLabel="Go back"
    />
  );
}
