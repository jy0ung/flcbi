import type {
  AppRole,
  User,
} from "@flcbi/contracts";

const APP_ROLE_SET = new Set<AppRole>([
  "super_admin",
  "company_admin",
  "director",
  "general_manager",
  "manager",
  "sales",
  "accounts",
  "analyst",
]);

export interface SupabaseProfileRow {
  id: string;
  email: string;
  display_name: string;
  app_role: string;
  company_id: string | null;
  primary_branch_id: string | null;
}

export function toAppRole(value: string): AppRole {
  return APP_ROLE_SET.has(value as AppRole) ? (value as AppRole) : "manager";
}

export function toContractUser(row: SupabaseProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: toAppRole(row.app_role),
    companyId: row.company_id ?? "",
    branchId: row.primary_branch_id ?? undefined,
  };
}
