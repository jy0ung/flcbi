import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import {
  IMPORT_PREVIEW_JOB_NAME,
  type DataQualityIssue,
  type ImportPreviewJobPayload,
  type VehicleRaw,
  parseWorkbook,
  summarizeParsedWorkbook,
} from "@flcbi/contracts";

interface ImportJobRow {
  id: string;
  company_id: string;
  storage_path: string | null;
  status: string;
  preview_available: boolean | null;
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured for the worker");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function getImportBucket() {
  return process.env.SUPABASE_STORAGE_IMPORT_BUCKET ?? "flcbi-imports";
}

export async function processImportPreviewJob(job: Job<ImportPreviewJobPayload>) {
  if (job.name !== IMPORT_PREVIEW_JOB_NAME) {
    return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
  }

  const client = getSupabaseAdminClient();
  const importJob = await fetchImportJob(client, job.data.importId);
  if (!importJob) {
    throw new Error(`Import ${job.data.importId} was not found`);
  }
  if (!importJob.storage_path) {
    throw new Error(`Import ${job.data.importId} does not have a storage path`);
  }
  if (importJob.preview_available && ["validated", "failed"].includes(importJob.status)) {
    return { ok: true, skipped: true, importId: importJob.id, status: importJob.status };
  }
  if (["publish_in_progress", "published"].includes(importJob.status)) {
    return { ok: true, skipped: true, importId: importJob.id, status: importJob.status };
  }

  await updateImportStatus(client, importJob.company_id, importJob.id, "validating");

  try {
    const workbook = await downloadImportWorkbook(client, importJob.storage_path);
    const parsed = parseWorkbook(workbook);
    const branchIdByCode = await fetchBranchIdByCode(client, importJob.company_id);

    await clearImportPreviewArtifacts(client, importJob.company_id, importJob.id);
    await persistRawImportRows(client, importJob.company_id, importJob.id, parsed.rows, branchIdByCode);
    await persistImportIssues(client, importJob.company_id, importJob.id, parsed.issues, branchIdByCode, parsed.rows);
    const summary = summarizeParsedWorkbook(parsed);

    await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: summary.status,
        total_rows: summary.totalRows,
        valid_rows: summary.validRows,
        error_rows: summary.errorRows,
        duplicate_rows: summary.duplicateRows,
        missing_columns: parsed.missingColumns,
        preview_available: true,
      })
      .eq("company_id", importJob.company_id)
      .eq("id", importJob.id)
      .throwOnError();

    return {
      ok: true,
      importId: importJob.id,
      status: summary.status,
      totalRows: summary.totalRows,
    };
  } catch (error) {
    await runBestEffort(async () => {
      await clearImportPreviewArtifacts(client, importJob.company_id, importJob.id);
    });
    await runBestEffort(async () => {
      await client
        .schema("app")
        .from("import_jobs")
        .update({
          status: "failed",
          total_rows: 0,
          valid_rows: 0,
          error_rows: 0,
          duplicate_rows: 0,
          missing_columns: [],
          preview_available: false,
        })
        .eq("company_id", importJob.company_id)
        .eq("id", importJob.id)
        .throwOnError();
    });
    throw error;
  }
}

async function fetchImportJob(client: SupabaseClient, importId: string) {
  const { data } = await client
    .schema("app")
    .from("import_jobs")
    .select("id, company_id, storage_path, status, preview_available")
    .eq("id", importId)
    .maybeSingle()
    .throwOnError();

  return (data as ImportJobRow | null) ?? null;
}

async function updateImportStatus(
  client: SupabaseClient,
  companyId: string,
  importId: string,
  status: string,
) {
  await client
    .schema("app")
    .from("import_jobs")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", importId)
    .throwOnError();
}

async function downloadImportWorkbook(client: SupabaseClient, storagePath: string) {
  const { data, error } = await client.storage
    .from(getImportBucket())
    .download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? `Failed to download import workbook at ${storagePath}`);
  }

  return data.arrayBuffer();
}

async function fetchBranchIdByCode(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("app")
    .from("branches")
    .select("id, code")
    .eq("company_id", companyId)
    .throwOnError();

  return new Map(
    ((data ?? []) as Array<{ id: string; code: string }>).map((row) => [row.code, row.id]),
  );
}

async function clearImportPreviewArtifacts(
  client: SupabaseClient,
  companyId: string,
  importId: string,
) {
  await client
    .schema("raw")
    .from("vehicle_import_rows")
    .delete()
    .eq("company_id", companyId)
    .eq("import_job_id", importId)
    .throwOnError();

  await client
    .schema("app")
    .from("quality_issues")
    .delete()
    .eq("company_id", companyId)
    .eq("import_job_id", importId)
    .throwOnError();
}

async function persistRawImportRows(
  client: SupabaseClient,
  companyId: string,
  importId: string,
  rows: VehicleRaw[],
  branchIdByCode: Map<string, string>,
) {
  const persistedRows = rows.filter((row) => row.chassis_no);
  if (persistedRows.length === 0) {
    return;
  }

  const payload = persistedRows.map((row) => ({
    company_id: companyId,
    import_job_id: importId,
    branch_id: row.branch_code ? (branchIdByCode.get(row.branch_code) ?? null) : null,
    source_row_number: row.row_number,
    chassis_no: row.chassis_no,
    model: row.model ?? null,
    payment_method: row.payment_method ?? null,
    salesman_name: row.salesman_name ?? null,
    customer_name: row.customer_name ?? null,
    is_d2d: row.is_d2d ?? false,
    bg_date: row.bg_date ?? null,
    shipment_etd_pkg: row.shipment_etd_pkg ?? null,
    shipment_eta: row.shipment_eta_kk_twu_sdk ?? null,
    date_received_by_outlet: row.date_received_by_outlet ?? null,
    reg_date: row.reg_date ?? null,
    delivery_date: row.delivery_date ?? null,
    disb_date: row.disb_date ?? null,
    raw_payload: row,
  }));

  for (const chunk of chunkArray(payload, 500)) {
    await client
      .schema("raw")
      .from("vehicle_import_rows")
      .insert(chunk)
      .throwOnError();
  }
}

async function persistImportIssues(
  client: SupabaseClient,
  companyId: string,
  importId: string,
  issues: DataQualityIssue[],
  branchIdByCode: Map<string, string>,
  rows: VehicleRaw[],
) {
  if (issues.length === 0) {
    return;
  }

  const branchIdByChassis = new Map(
    rows
      .filter((row) => row.chassis_no)
      .map((row) => [row.chassis_no, row.branch_code ? (branchIdByCode.get(row.branch_code) ?? null) : null]),
  );

  const payload = issues.map((issue) => ({
    company_id: companyId,
    branch_id: branchIdByChassis.get(issue.chassisNo) ?? null,
    import_job_id: importId,
    dataset_version_id: null,
    source_row_id: null,
    chassis_no: issue.chassisNo || null,
    field: issue.field,
    issue_type: issue.issueType,
    message: issue.message,
    severity: issue.severity,
  }));

  for (const chunk of chunkArray(payload, 500)) {
    await client
      .schema("app")
      .from("quality_issues")
      .insert(chunk)
      .throwOnError();
  }
}

async function runBestEffort(action: () => Promise<void>) {
  try {
    await action();
  } catch {
    // Keep the original worker error as the primary failure.
  }
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
