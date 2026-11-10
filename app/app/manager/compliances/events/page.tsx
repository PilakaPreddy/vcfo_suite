import { EventsPage } from "@/views/compliance-events/EventsPage";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Company events", "Company events that start an MCA filing");

/** Route shell only. The shared view is the same in every staff shell; `AuthContext` decides the rows. */
export default function Page() {
  return <EventsPage basePath="/app/manager" />;
}
