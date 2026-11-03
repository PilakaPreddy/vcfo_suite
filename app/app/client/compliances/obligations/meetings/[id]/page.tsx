import { Suspense } from 'react';
import { ClientCompliancesMeetingRoute } from '@/components/client-portal/pages/compliances';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Board meeting', 'One board meeting shared with the client');

/** Client portal board meeting page: read only, shown once the notice is sent. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientCompliancesMeetingRoute />
    </Suspense>
  );
}
