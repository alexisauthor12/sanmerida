import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import DashboardClient from "./DashboardClient";
import MemberDashboardClient from "./MemberDashboardClient";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user?.userId) {
    redirect("/login");
  }

  if (user.isMember) {
    return <MemberDashboardClient user={user} />;
  }

  return <DashboardClient user={user} />;
}
