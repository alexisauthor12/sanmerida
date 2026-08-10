import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import IndustrialDashboardClient from "./IndustrialDashboardClient";

export default async function AdminIndustrialPage() {
  const user = await getSessionUser();

  if (!user?.userId) {
    redirect("/login");
  }

  return <IndustrialDashboardClient user={user} />;
}