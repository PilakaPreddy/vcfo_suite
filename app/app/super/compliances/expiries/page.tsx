import { ExpiriesPage } from "@/views/expiries/ExpiriesPage";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Expiries", "DSC, DIR-3 KYC and registration expiries");

/** Route shell only. The shared view is the same in every staff shell; `AuthContext` decides the rows. */
export default function Page() {
  return <ExpiriesPage basePath="/app/super/compliances/expiries" />;
}
