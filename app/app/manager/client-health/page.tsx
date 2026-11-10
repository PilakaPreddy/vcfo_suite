import { ClientHealthBoard } from "@/views/client-health/ClientHealthBoard";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Client health", "Computed health of every client, with the signals behind it");

export default function Page() {
  return <ClientHealthBoard basePath="/app/manager/client-health" />;
}
