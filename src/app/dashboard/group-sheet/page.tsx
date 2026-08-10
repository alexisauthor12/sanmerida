import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import GroupSheetClient from "./GroupSheetClient";

type GroupSheetPageProps = {
  searchParams: Promise<{ group?: string; planType?: string }>;
};

export default async function GroupSheetPage({ searchParams }: GroupSheetPageProps) {
  const user = await getSessionUser();

  if (!user?.userId || user.isMember) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const group = typeof params.group === "string" ? params.group.trim() : "";
  const planType = params.planType === "83" ? "83" : "26";

  return <GroupSheetClient initialGroup={group || "Grupo 01"} initialPlanType={planType} />;
}
