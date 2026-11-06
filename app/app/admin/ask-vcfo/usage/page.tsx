import AskTokenUse from "@/views/admin/ask/AskTokenUse";

import { pageMetadata } from "@/lib/shell/page-metadata";

export const metadata = pageMetadata("Ask VCFO token use", "Tokens and estimated cost per Ask VCFO path");

export default function Page() {
  return <AskTokenUse />;
}
