import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AdminDashboardClient from "@/app/dashboard/AdminDashboardClient";

export default async function AdminPage() {
  const user = await getSessionUser();

  if (!user?.userId) {
    redirect("/login");
  }

  return <AdminDashboardClient user={user} />;
}
