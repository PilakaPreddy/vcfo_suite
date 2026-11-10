import { Suspense } from "react";
import { RequestListsPage } from "@/views/request-lists/RequestListsPage";
import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Requests", "Documents, answers and confirmations we need from you");

export default function Page() {
  return (
    <Suspense>
      <RequestListsPage />
    </Suspense>
  );
}
