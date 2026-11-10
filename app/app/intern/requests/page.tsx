import { Suspense } from "react";
import { RequestListsPage } from "@/views/request-lists/RequestListsPage";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Requests", "Request lists sent to clients, with reminders until every item is in");

export default function Page() {
  return (
    <Suspense>
      <RequestListsPage />
    </Suspense>
  );
}
