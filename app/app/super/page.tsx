import { redirect } from "next/navigation";

/** The bare super admin address opens the dashboard, as every other role's does. */
export default function Page() {
  redirect("/app/super/dashboard");
}
