import type { Tone } from "@/lib/constants";
import type { Permission } from "@/lib/auth/session";
import type { NavBadgeKey } from "./nav";

export type ShellData = {
  user: { name: string; email: string; avatarColor: string };
  company: { id: string; name: string; cui: string };
  companies: { id: string; name: string; cui: string; role: string }[];
  role: string;
  permissions: Permission[];
  badges: Partial<Record<NavBadgeKey, number>>;
  anaf: { label: string; tone: Tone; environment: string };
  aiConfigured: boolean;
};
