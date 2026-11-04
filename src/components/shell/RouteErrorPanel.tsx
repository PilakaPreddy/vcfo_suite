'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The panel every nested route `error.tsx` renders: a warning, the error id, "Try again" and a
 * way out. `backHref` sends the viewer to a fixed page; without it the second button goes back.
 */
export function RouteErrorPanel({
  error,
  reset,
  logTag,
  title,
  body,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  logTag: string;
  title: string;
  body: string;
  backHref?: string;
  backLabel: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log to the console so it appears in the server function logs.
    console.error(`[${logTag}] render error:`, error.message, error.digest, error.stack);
  }, [error, logTag]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center px-4">
      <AlertTriangle className="h-10 w-10 text-warning" aria-hidden />
      <div className="space-y-2 max-w-sm">
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{body}</p>
        {error.digest && <p className="font-mono text-[11px] text-ink-muted">Error ID: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button type="button" variant="outline" size="sm" onClick={reset} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
