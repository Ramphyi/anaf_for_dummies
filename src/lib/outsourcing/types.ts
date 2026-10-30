/** Forme serializabile trimise de Server Components către componentele client din modulul de outsourcing. */

export type MemberLite = {
  id: string;
  name: string;
  color: string;
  position: string | null;
  department: string | null;
  weeklyCapacity: number;
  active: boolean;
};

export type ProjectLite = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  status: string;
  billingType: string;
  currency: string;
  clientName: string | null;
};

export type TaskLite = { id: string; projectId: string; title: string; status: string };

export type AllocationRow = {
  id: string;
  memberId: string;
  projectId: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  notes: string | null;
};

export type TimeOffRow = {
  id: string;
  memberId: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
};

export type ClientOption = { id: string; name: string; currency: string | null };

/** Formular proiect (dialog creare/editare). */
export type ProjectFormData = {
  id?: string | null;
  name: string;
  code: string | null;
  clientId: string | null;
  description: string | null;
  status: string;
  billingType: string;
  hourlyRate: number | null;
  currency: string;
  budgetHours: number | null;
  budgetAmount: number | null;
  monthlyRetainer: number | null;
  startDate: string | null;
  endDate: string | null;
  color: string;
  managerId: string | null;
};

/** Formular membru echipă. */
export type MemberFormData = {
  id?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  seniority: string;
  employmentType: string;
  hourlyCost: number;
  hourlyRate: number;
  rateCurrency: string;
  weeklyCapacity: number;
  color: string;
  skills: string[];
  startDate: string | null;
  active: boolean;
};
