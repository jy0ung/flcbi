import { Queue, type Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALERT_EVALUATION_JOB_NAME,
  ALERT_QUEUE_NAME,
  IMPORT_PUBLISH_JOB_NAME,
  publishCanonical,
  type AlertEvaluationJobPayload,
  type DataQualityIssue,
  type ImportPublishJobPayload,
  type Notification,
  type VehicleCanonical,
  type VehicleRaw,
} from "@flcbi/contracts";
import { getSupabaseAdminClient, runBestEffort } from "./supabase-admin.js";

interface ImportJobRow {
  id: string;
  company_id: string;
  file_name: string;
  status: string;
  processing_started_at: string | null;
  last_error_at: string | null;
  error_message: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
}

interface RawImportRow {
  id: string;
  import_job_id: string;
  source_row_number: number;
  chassis_no: string;
  model: string | null;
  payment_method: string | null;
  salesman_name: string | null;
  customer_name: string | null;
  is_d2d: boolean;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
  raw_payload: Partial<VehicleRaw> | null;
}

interface QualityIssueRow {
  id: string;
  chassis_no: string | null;
  field: string;
  issue_type: DataQualityIssue["issueType"];
  message: string;
  severity: DataQualityIssue["severity"];
  import_job_id: string;
}

let alertsQueue: Queue<AlertEvaluationJobPayload> | undefined;

export async function processImportPublishJob(job: Job<ImportPublishJobPayload>) {
  if (job.name !== IMPORT_PUBLISH_JOB_NAME) {
    return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
  }

  const client = getSupabaseAdminClient();
  const importJob = await fetchImportJob(client, job.data.importId);
  const attemptCount = job.attemptsMade + 1;
  const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  if (!importJob) {
    throw new Error(`Import ${job.data.importId} was not found`);
  }

  try {
    if (importJob.status === "published") {
      return { ok: true, skipped: true, importId: importJob.id, status: importJob.status };
    }

    await updateImportJob(client, importJob.company_id, importJob.id, {
      processing_started_at: new Date().toISOString(),
      last_error_at: null,
      error_message: null,
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
    });

    const previewRows = await fetchPersistedRawRows(client, importJob.company_id, importJob.id);
    const previewIssues = await fetchPersistedIssues(client, importJob.company_id, importJob.id);
    if (previewRows.length === 0) {
      throw new Error(`Import ${importJob.id} preview is no longer available`);
    }

    const branchIdByCode = await fetchBranchIdByCode(client, importJob.company_id);
    const { canonical, issues } = publishCanonical(
      previewRows.map((row) => ({ ...row, import_batch_id: importJob.id })),
    );
    if (canonical.length === 0) {
      throw new Error("No canonical vehicle rows were produced from this import");
    }

    const branchIdByChassis = new Map(
      canonical.map((vehicle) => [vehicle.chassis_no, branchIdByCode.get(vehicle.branch_code) ?? null]),
    );
    const publishedAt = new Date().toISOString();
    const { data: datasetVersionId, error } = await client
      .schema("app")
      .rpc("publish_import_atomic", {
        p_company_id: importJob.company_id,
        p_import_job_id: importJob.id,
        p_published_by: job.data.requestedByUserId,
        p_published_at: publishedAt,
        p_publish_mode: job.data.publishMode,
        p_vehicle_rows: buildPublishVehicleRows(canonical, branchIdByCode),
        p_quality_issues: buildPublishQualityIssueRows([...previewIssues, ...issues], branchIdByChassis),
      });

    if (error || !datasetVersionId) {
      throw new Error(error?.message ?? "Failed to publish import");
    }

    await updateImportJob(client, importJob.company_id, importJob.id, {
      last_error_at: null,
      error_message: null,
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
    });

    await runBestEffort(`import_publish_audit:${importJob.id}`, async () => {
      await addAuditEvent(client, {
        companyId: importJob.company_id,
        userId: job.data.requestedByUserId,
        userName: job.data.requestedByUserName,
        action: "import_published",
        entity: "import_batch",
        entityId: importJob.id,
        details: `Published ${canonical.length} canonical vehicles from ${importJob.file_name} using ${job.data.publishMode} mode`,
      });
    });

    await runBestEffort(`import_publish_notification:${importJob.id}`, async () => {
      await createNotification(client, {
        companyId: importJob.company_id,
        userId: job.data.requestedByUserId,
        title: `Import published: ${importJob.file_name}`,
        message: `${canonical.length} vehicles are now live in ${job.data.publishMode} mode.`,
        type: "success",
        fingerprint: `import-published:${importJob.id}:${job.data.publishMode}`,
        metadata: {
          importId: importJob.id,
          datasetVersionId: String(datasetVersionId),
          publishMode: job.data.publishMode,
          canonicalCount: canonical.length,
        },
      });
    });

    await runBestEffort(`import_publish_alert_enqueue:${importJob.id}`, async () => {
      await getAlertsQueue().add(ALERT_EVALUATION_JOB_NAME, {
        companyId: importJob.company_id,
        triggeredAt: publishedAt,
        reason: "import_publish",
      }, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 500,
        },
      });
    });

    return {
      ok: true,
      importId: importJob.id,
      datasetVersionId: String(datasetVersionId),
      canonicalCount: canonical.length,
    };
  } catch (error) {
    await runBestEffort(`import_publish_attempt_failure:${importJob.id}`, async () => {
      await updateImportJob(client, importJob.company_id, importJob.id, {
        last_error_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        attempt_count: attemptCount,
        max_attempts: maxAttempts,
      });
    });
    if (job.attemptsMade + 1 >= maxAttempts) {
      await runBestEffort(`import_publish_mark_failed:${importJob.id}`, async () => {
        await markImportPublishFailed(
          client,
          importJob.company_id,
          importJob.id,
          error instanceof Error ? error.message : String(error),
          attemptCount,
          maxAttempts,
        );
      });
      await runBestEffort(`import_publish_failure_audit:${importJob.id}`, async () => {
        await addAuditEvent(client, {
          companyId: importJob.company_id,
          userId: job.data.requestedByUserId,
          userName: job.data.requestedByUserName,
          action: "import_publish_failed",
          entity: "import_batch",
          entityId: importJob.id,
          details: `Automatic publish failed for ${importJob.file_name}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      await runBestEffort(`import_publish_failure_notification:${importJob.id}`, async () => {
        await createNotification(client, {
          companyId: importJob.company_id,
          userId: job.data.requestedByUserId,
          title: `Import publish failed: ${importJob.file_name}`,
          message: "Automatic publish stopped before the live dataset was updated. Review the import and retry publish.",
          type: "error",
          fingerprint: `import-publish-failed:${importJob.id}`,
          metadata: {
            importId: importJob.id,
            publishMode: job.data.publishMode,
          },
        });
      });
    }

    throw error;
  }
}

async function fetchImportJob(client: SupabaseClient, importId: string) {
  const { data } = await client
    .schema("app")
    .from("import_jobs")
    .select("id, company_id, file_name, status, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
    .eq("id", importId)
    .maybeSingle()
    .throwOnError();

  return (data as ImportJobRow | null) ?? null;
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

async function fetchPersistedIssues(client: SupabaseClient, companyId: string, importId: string) {
  const { data } = await client
    .schema("app")
    .from("quality_issues")
    .select("id, chassis_no, field, issue_type, message, severity, import_job_id")
    .eq("company_id", companyId)
    .eq("import_job_id", importId)
    .order("created_at", { ascending: true })
    .throwOnError();

  return ((data ?? []) as QualityIssueRow[]).map((row) => ({
    id: row.id,
    chassisNo: row.chassis_no ?? "",
    field: row.field,
    issueType: row.issue_type,
    message: row.message,
    severity: row.severity,
    importBatchId: row.import_job_id,
  }));
}

async function fetchPersistedRawRows(client: SupabaseClient, companyId: string, importId: string) {
  const { data } = await client
    .schema("raw")
    .from("vehicle_import_rows")
    .select("id, import_job_id, source_row_number, chassis_no, model, payment_method, salesman_name, customer_name, is_d2d, bg_date, shipment_etd_pkg, shipment_eta, date_received_by_outlet, reg_date, delivery_date, disb_date, raw_payload")
    .eq("company_id", companyId)
    .eq("import_job_id", importId)
    .order("source_row_number", { ascending: true })
    .throwOnError();

  return ((data ?? []) as RawImportRow[]).map(mapRawImportRow);
}

function mapRawImportRow(row: RawImportRow): VehicleRaw {
  const payload = row.raw_payload ?? {};
  return {
    id: payload.id ?? row.id,
    import_batch_id: payload.import_batch_id ?? row.import_job_id,
    row_number: payload.row_number ?? row.source_row_number,
    chassis_no: payload.chassis_no ?? row.chassis_no,
    bg_date: payload.bg_date ?? row.bg_date ?? undefined,
    shipment_etd_pkg: payload.shipment_etd_pkg ?? row.shipment_etd_pkg ?? undefined,
    shipment_eta_kk_twu_sdk: payload.shipment_eta_kk_twu_sdk ?? row.shipment_eta ?? undefined,
    date_received_by_outlet: payload.date_received_by_outlet ?? row.date_received_by_outlet ?? undefined,
    reg_date: payload.reg_date ?? row.reg_date ?? undefined,
    delivery_date: payload.delivery_date ?? row.delivery_date ?? undefined,
    disb_date: payload.disb_date ?? row.disb_date ?? undefined,
    branch_code: payload.branch_code,
    model: payload.model ?? row.model ?? undefined,
    payment_method: payload.payment_method ?? row.payment_method ?? undefined,
    salesman_name: payload.salesman_name ?? row.salesman_name ?? undefined,
    customer_name: payload.customer_name ?? row.customer_name ?? undefined,
    remark: payload.remark,
    vaa_date: payload.vaa_date,
    full_payment_date: payload.full_payment_date,
    is_d2d: payload.is_d2d ?? row.is_d2d,
    source_row_no: payload.source_row_no,
    variant: payload.variant,
    dealer_transfer_price: payload.dealer_transfer_price,
    full_payment_type: payload.full_payment_type,
    shipment_name: payload.shipment_name,
    lou: payload.lou,
    contra_sola: payload.contra_sola,
    reg_no: payload.reg_no,
    invoice_no: payload.invoice_no,
    obr: payload.obr,
  };
}

function buildPublishVehicleRows(
  canonical: VehicleCanonical[],
  branchIdByCode: Map<string, string>,
) {
  return canonical.map((vehicle) => ({
    branch_id: branchIdByCode.get(vehicle.branch_code) ?? null,
    chassis_no: vehicle.chassis_no,
    model: vehicle.model,
    payment_method: vehicle.payment_method,
    salesman_name: vehicle.salesman_name,
    customer_name: vehicle.customer_name,
    is_d2d: vehicle.is_d2d,
    bg_date: vehicle.bg_date ?? null,
    shipment_etd_pkg: vehicle.shipment_etd_pkg ?? null,
    shipment_eta: vehicle.shipment_eta_kk_twu_sdk ?? null,
    date_received_by_outlet: vehicle.date_received_by_outlet ?? null,
    reg_date: vehicle.reg_date ?? null,
    delivery_date: vehicle.delivery_date ?? null,
    disb_date: vehicle.disb_date ?? null,
    bg_to_delivery: vehicle.bg_to_delivery ?? null,
    bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
    etd_to_outlet_received: vehicle.etd_to_outlet_received ?? null,
    outlet_received_to_reg: vehicle.outlet_received_to_reg ?? null,
    reg_to_delivery: vehicle.reg_to_delivery ?? null,
    etd_to_eta: vehicle.etd_to_eta ?? null,
    eta_to_outlet_received: vehicle.eta_to_outlet_received ?? null,
    outlet_received_to_delivery: vehicle.outlet_received_to_delivery ?? null,
    bg_to_disb: vehicle.bg_to_disb ?? null,
    delivery_to_disb: vehicle.delivery_to_disb ?? null,
  }));
}

function buildPublishQualityIssueRows(
  issues: DataQualityIssue[],
  branchIdByChassis: Map<string, string | null>,
) {
  return issues.map((issue) => ({
    branch_id: branchIdByChassis.get(issue.chassisNo) ?? null,
    chassis_no: issue.chassisNo || null,
    field: issue.field,
    issue_type: issue.issueType,
    message: issue.message,
    severity: issue.severity,
  }));
}

async function markImportPublishFailed(
  client: SupabaseClient,
  companyId: string,
  importId: string,
  errorMessage: string,
  attemptCount: number,
  maxAttempts: number,
) {
  await client
    .schema("app")
    .from("import_jobs")
    .update({
      status: "failed",
      preview_available: true,
      published_at: null,
      dataset_version_id: null,
      last_error_at: new Date().toISOString(),
      error_message: errorMessage,
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
    })
    .eq("company_id", companyId)
    .eq("id", importId)
    .throwOnError();
}

async function updateImportJob(
  client: SupabaseClient,
  companyId: string,
  importId: string,
  input: Record<string, string | number | null>,
) {
  await client
    .schema("app")
    .from("import_jobs")
    .update(input)
    .eq("company_id", companyId)
    .eq("id", importId)
    .throwOnError();
}

async function addAuditEvent(client: SupabaseClient, input: {
  companyId: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
}) {
  await client
    .schema("app")
    .from("audit_events")
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId,
      details: input.details,
      metadata: { userName: input.userName },
    })
    .throwOnError();
}

async function createNotification(client: SupabaseClient, input: {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type: Notification["type"];
  fingerprint: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await client
    .schema("app")
    .from("notifications")
    .upsert({
      company_id: input.companyId,
      user_id: input.userId,
      alert_rule_id: null,
      title: input.title,
      message: input.message,
      type: input.type,
      read: false,
      fingerprint: input.fingerprint,
      metadata: input.metadata ?? {},
    }, {
      onConflict: "user_id,fingerprint",
      ignoreDuplicates: true,
    })
    .throwOnError();
}

function getAlertsQueue() {
  if (!alertsQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is not configured");
    }

    alertsQueue = new Queue<AlertEvaluationJobPayload>(ALERT_QUEUE_NAME, {
      connection: { url: redisUrl },
    });
  }

  return alertsQueue;
}
