import { KPI_DEFINITIONS, type AppRole } from "@flcbi/contracts";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const BOOTSTRAP_COMPANY_NAME = process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "FLC BI";
const BOOTSTRAP_COMPANY_CODE = process.env.BOOTSTRAP_COMPANY_CODE?.trim() || "FLCBI";
const BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "admin@local.flcbi";
const BOOTSTRAP_ADMIN_NAME = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Platform Administrator";
const BOOTSTRAP_ADMIN_ROLE = normalizeRole(process.env.BOOTSTRAP_ADMIN_ROLE);
const BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
const BOOTSTRAP_BRANCHES = parseBranches(process.env.BOOTSTRAP_BRANCHES);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const company = await upsertCompany();
  const branches = await upsertBranches(company.id);
  const existingUser = await findAuthUserByEmail(BOOTSTRAP_ADMIN_EMAIL);
  const passwordForCreation = BOOTSTRAP_ADMIN_PASSWORD || randomBytes(18).toString("base64url");

  const authUserId = existingUser
    ? await updateOrReuseAuthUser(existingUser.id, BOOTSTRAP_ADMIN_PASSWORD)
    : await createAuthUser(passwordForCreation);

  const primaryBranchId = branches[0]?.id ?? null;
  await upsertUserProfile(authUserId, company.id, primaryBranchId);
  await upsertBranchAccess(authUserId, branches.map((branch) => branch.id));
  await upsertDefaultSlas(company.id, authUserId);

  const shouldPrintPassword = !existingUser || Boolean(BOOTSTRAP_ADMIN_PASSWORD);

  console.log(`Bootstrapped company ${company.code} (${company.id})`);
  console.log(`Admin email: ${BOOTSTRAP_ADMIN_EMAIL}`);
  console.log(`Admin role: ${BOOTSTRAP_ADMIN_ROLE}`);
  console.log(`Branches configured: ${branches.length}`);
  if (shouldPrintPassword) {
    console.log(`Admin password: ${BOOTSTRAP_ADMIN_PASSWORD ?? passwordForCreation}`);
  } else {
    console.log("Admin password: unchanged");
  }
}

async function upsertCompany() {
  const { data, error } = await supabase
    .schema("app")
    .from("companies")
    .upsert(
      {
        code: BOOTSTRAP_COMPANY_CODE,
        name: BOOTSTRAP_COMPANY_NAME,
      },
      { onConflict: "code" },
    )
    .select("id, code, name")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to upsert company");
  }

  return data;
}

async function upsertBranches(companyId: string) {
  if (BOOTSTRAP_BRANCHES.length === 0) {
    return [] as Array<{ id: string; code: string; name: string }>;
  }

  const { error } = await supabase
    .schema("app")
    .from("branches")
    .upsert(
      BOOTSTRAP_BRANCHES.map((branch) => ({
        company_id: companyId,
        code: branch.code,
        name: branch.name,
      })),
      { onConflict: "company_id,code" },
    );

  if (error) {
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .schema("app")
    .from("branches")
    .select("id, code, name")
    .eq("company_id", companyId)
    .in("code", BOOTSTRAP_BRANCHES.map((branch) => branch.code))
    .order("code", { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  return (data ?? []) as Array<{ id: string; code: string; name: string }>;
}

async function findAuthUserByEmail(email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) {
      return found;
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function createAuthUser(password: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: BOOTSTRAP_ADMIN_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { name: BOOTSTRAP_ADMIN_NAME },
    app_metadata: { provider: "email" },
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to create bootstrap auth user");
  }

  return data.user.id;
}

async function updateOrReuseAuthUser(userId: string, password?: string) {
  if (!password) {
    return userId;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { name: BOOTSTRAP_ADMIN_NAME },
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to update bootstrap auth user");
  }

  return data.user.id;
}

async function upsertUserProfile(userId: string, companyId: string, primaryBranchId: string | null) {
  const { error } = await supabase
    .schema("app")
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        company_id: companyId,
        primary_branch_id: primaryBranchId,
        email: BOOTSTRAP_ADMIN_EMAIL,
        display_name: BOOTSTRAP_ADMIN_NAME,
        app_role: BOOTSTRAP_ADMIN_ROLE,
        status: "active",
      },
      { onConflict: "id" },
    );

  if (error) {
    throw error;
  }
}

async function upsertBranchAccess(userId: string, branchIds: string[]) {
  if (branchIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .schema("app")
    .from("user_branch_access")
    .upsert(
      branchIds.map((branchId) => ({
        user_id: userId,
        branch_id: branchId,
      })),
      { onConflict: "user_id,branch_id" },
    );

  if (error) {
    throw error;
  }
}

async function upsertDefaultSlas(companyId: string, updatedBy: string) {
  const { error } = await supabase
    .schema("app")
    .from("sla_policies")
    .upsert(
      KPI_DEFINITIONS.map((kpi) => ({
        company_id: companyId,
        kpi_id: kpi.id,
        label: kpi.shortLabel,
        sla_days: kpi.slaDefault,
        updated_by: updatedBy,
      })),
      { onConflict: "company_id,kpi_id" },
    );

  if (error) {
    throw error;
  }
}

function normalizeRole(value?: string): AppRole {
  const role = value?.trim() as AppRole | undefined;
  if (role && ["super_admin", "company_admin", "director", "general_manager", "manager", "sales", "accounts", "analyst"].includes(role)) {
    return role;
  }
  return "company_admin";
}

function parseBranches(value?: string) {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, ...nameParts] = entry.split(":");
      const branchCode = code?.trim().toUpperCase();
      const branchName = nameParts.join(":").trim() || branchCode;

      if (!branchCode) {
        throw new Error(`Invalid BOOTSTRAP_BRANCHES entry: ${entry}`);
      }

      return {
        code: branchCode,
        name: branchName,
      };
    });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
