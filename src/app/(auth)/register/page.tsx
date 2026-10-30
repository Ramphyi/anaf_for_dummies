import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Cont nou" };

export default function RegisterPage() {
  return <RegisterForm />;
}
