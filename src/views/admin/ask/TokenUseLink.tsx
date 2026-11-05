'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useApp } from '@/context/AppContext';

/** The way to the token report, which only a super admin may open. */
export function TokenUseLink() {
  const { role } = useApp();
  if (role !== 'super_admin') return null;
  return (
    <Link href="/app/admin/ask-vcfo/usage" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
      Token use
    </Link>
  );
}
