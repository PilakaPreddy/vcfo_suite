import { Suspense } from "react";
import { NoticesPage } from "@/views/notices/NoticesPage";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Notices", "GST, income tax, TDS and MCA notices across your clients");

/** Route shell only. The shared view is the same in every staff shell; `AuthContext` decides the rows. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <NoticesPage basePath="/app/admin/compliances/notices" />
    </Suspense>
  );
}
