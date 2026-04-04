import type { AppRole, PermissionGrant, User } from "./domain.js";

const SELF_COMPANY = "*";
const SELF_BRANCH = "__self_branch__";

export const ROLE_PERMISSIONS: Record<AppRole, PermissionGrant[]> = {
  super_admin: [
    { resource: "platform", actions: ["*"], companyId: SELF_COMPANY },
  ],
  company_admin: [
    { resource: "aging", actions: ["read", "write", "export", "publish"], companyId: SELF_COMPANY },
    { resource: "admin", actions: ["read", "write"], companyId: SELF_COMPANY },
    { resource: "audit", actions: ["read"], companyId: SELF_COMPANY },
  ],
  director: [
    { resource: "aging", actions: ["read", "export"], companyId: SELF_COMPANY },
    { resource: "audit", actions: ["read"], companyId: SELF_COMPANY },
  ],
  general_manager: [
    { resource: "aging", actions: ["read", "export"], companyId: SELF_COMPANY },
  ],
  manager: [
    { resource: "aging", actions: ["read", "export"], companyId: SELF_COMPANY, branchIds: [SELF_BRANCH] },
  ],
  sales: [
    { resource: "aging", actions: ["read"], companyId: SELF_COMPANY, branchIds: [SELF_BRANCH] },
  ],
  accounts: [
    { resource: "aging", actions: ["read"], companyId: SELF_COMPANY, branchIds: [SELF_BRANCH] },
  ],
  analyst: [
    { resource: "aging", actions: ["read", "export"], companyId: SELF_COMPANY },
  ],
};

export function getPermissionsForUser(user: User): PermissionGrant[] {
  return ROLE_PERMISSIONS[user.role].map((grant) => ({
    ...grant,
    companyId: grant.companyId === SELF_COMPANY ? user.companyId : grant.companyId,
    branchIds: grant.branchIds?.includes(SELF_BRANCH)
      ? (user.branchId ? [user.branchId] : undefined)
      : grant.branchIds,
  }));
}

export function hasResourceAction(
  permissions: PermissionGrant[],
  resource: string,
  action: string,
): boolean {
  return permissions.some(
    (grant) =>
      (grant.resource === resource || grant.resource === "platform") &&
      (grant.actions.includes("*") || grant.actions.includes(action)),
  );
}
