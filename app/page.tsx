import { headers } from "next/headers";
import { DashboardApp } from "@/components/dashboard-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedName)
      : null;
  const firstName = (fullName ?? email?.split("@")[0] ?? "Gerardo")
    .trim()
    .split(/\s+/)[0];

  return <DashboardApp userName={firstName || "Gerardo"} />;
}
