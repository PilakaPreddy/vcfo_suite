'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Opens the print box once the print view has rendered, and offers a Print button after that. */
export function PrintNow() {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <Button size="sm" variant="secondary" className="print:hidden" onClick={() => window.print()}>
      Print
    </Button>
  );
}
