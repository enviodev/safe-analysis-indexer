import { redirect } from "next/navigation";

// Redirect /analytics to /analytics/networks
export default function AnalyticsPage() {
  redirect("/analytics/networks");
}
