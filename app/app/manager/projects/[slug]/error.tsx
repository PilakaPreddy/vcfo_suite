'use client';

import { RouteErrorPanel } from '@/components/shell/RouteErrorPanel';

export default function AdminProjectError({
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
      logTag="admin/projects/[slug]"
      title="Couldn't load this project"
      body="A temporary error occurred. Try reloading — if it keeps happening, check your connection or try again later."
      backHref="/app/manager/projects"
      backLabel="Back to projects"
    />
  );
}
