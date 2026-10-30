import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Autentificare" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getContext()) redirect("/dashboard");
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/dashboard"} />;
}
