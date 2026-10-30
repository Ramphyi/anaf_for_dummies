"use server";

import { redirect } from "next/navigation";
import { destroySession, switchCompany } from "@/lib/auth/session";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchCompanyAction(companyId: string) {
  await switchCompany(companyId);
  redirect("/dashboard");
}
