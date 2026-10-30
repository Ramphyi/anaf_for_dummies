import { PasswordForm, ProfileForm } from "@/components/settings/profile-forms";
import { requireContext } from "@/lib/auth/session";

export const metadata = { title: "Profilul meu" };

export default async function ProfilePage() {
  const ctx = await requireContext();
  return (
    <div className="space-y-6">
      <ProfileForm initial={{ name: ctx.user.name, avatarColor: ctx.user.avatarColor }} email={ctx.user.email} role={ctx.role} companyName={ctx.company.name} />
      <PasswordForm />
    </div>
  );
}
