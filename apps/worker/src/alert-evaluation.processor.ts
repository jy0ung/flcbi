import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import {
  ALERT_EVALUATION_JOB_NAME,
  buildAgingSummary,
  buildAlertNotificationFingerprint,
  compareMetricValue,
  describeAlertComparator,
  getExecutiveDashboardMetricOption,
  getExecutiveMetricValue,
  type AlertEvaluationJobPayload,
  type AlertRule,
  type DataQualityIssue,
  type ImportBatch,
  type SlaPolicy,
  type VehicleCanonical,
} from "@flcbi/contracts";
import { getSupabaseAdminClient } from "./supabase-admin.js";

interface AlertRow {
  id: string;
  company_id: string;
  created_by: string | null;
  name: string;
  metric_id: AlertRule["metricId"];
  threshold: number | string;
  comparator: AlertRule["comparator"];
  frequency: AlertRule["frequency"];
  enabled: boolean;
  channel: AlertRule["channel"];
}

interface ProfileRow {
  id: string;
  display_name: string;
  app_role: string;
  primary_branch_id: string | null;
}

interface ImportJobRow {
  id: string;
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
  status: ImportBatch["status"];
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  missing_columns: string[] | null;
  published_at: string | null;
  preview_available: boolean | null;
  dataset_version_id: string | null;
  publish_mode: ImportBatch["publishMode"] | null;
}

interface SlaRow {
  id: string;
  kpi_id: string;
  label: string;
  sla_days: number;
  company_id: string;
}

interface VehicleRow {
  id: string;
  branch_id: string | null;
  branch_code: string | null;
  import_job_id: string;
  source_row_id: string | null;
  chassis_no: string;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
  model: string | null;
  payment_method: string | null;
  salesman_name: string | null;
  customer_name: string | null;
  is_d2d: boolean;
  bg_to_delivery: number | null;
  bg_to_shipment_etd: number | null;
  etd_to_outlet_received: number | null;
  outlet_received_to_reg: number | null;
  reg_to_delivery: number | null;
  etd_to_eta: number | null;
  eta_to_outlet_received: number | null;
  outlet_received_to_delivery: number | null;
  bg_to_disb: number | null;
  delivery_to_disb: number | null;
}

interface VisibleVehicle {
  branchId: string | null;
  vehicle: VehicleCanonical;
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

export async function processAlertEvaluationJob(job: Job<AlertEvaluationJobPayload>) {
  if (job.name !== ALERT_EVALUATION_JOB_NAME) {
    return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
  }

  const client = getSupabaseAdminClient();
  const companyIds = job.data.companyId
    ? [job.data.companyId]
    : await fetchCompanyIdsWithEnabledAlerts(client);
  let evaluatedAlerts = 0;
  let notificationsCreated = 0;

  for (const companyId of companyIds) {
    const result = await evaluateCompanyAlerts(client, companyId, job.data.triggeredAt);
    evaluatedAlerts += result.evaluatedAlerts;
    notificationsCreated += result.notificationsCreated;
  }

  return {
    ok: true,
    companyCount: companyIds.length,
    evaluatedAlerts,
    notificationsCreated,
  };
}

async function evaluateCompanyAlerts(
  client: SupabaseClient,
  companyId: string,
  triggeredAt: string,
) {
  const alerts = await fetchEnabledAlerts(client, companyId);
  if (alerts.length === 0) {
    return { evaluatedAlerts: 0, notificationsCreated: 0 };
  }

  const creatorIds = [...new Set(alerts.map((alert) => alert.created_by).filter((value): value is string => Boolean(value)))];
  const profiles = await fetchProfiles(client, creatorIds);
  const vehicles = await fetchVehicles(client, companyId);
  const issues = await fetchActiveQualityIssues(client, companyId);
  const imports = await fetchImports(client, companyId);
  const slas = await fetchSlas(client, companyId);
  const lastRefresh = imports.find((item) => item.publishedAt)?.publishedAt ?? triggeredAt;

  let notificationsCreated = 0;

  for (const alert of alerts) {
    if (!alert.created_by) {
      continue;
    }

    const profile = profiles.get(alert.created_by);
    if (!profile) {
      continue;
    }

    const visibleVehicles = filterVehiclesForProfile(vehicles, profile).map((item) => item.vehicle);
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.chassis_no));
    const visibleIssues = issues.filter((issue) => visibleVehicleIds.has(issue.chassisNo));
    const summary = buildAgingSummary(visibleVehicles, slas, visibleIssues, imports, lastRefresh);
    const value = getExecutiveMetricValue(summary, alert.metric_id);
    const threshold = Number(alert.threshold);

    if (!compareMetricValue(value, alert.comparator, threshold)) {
      continue;
    }

    const metric = getExecutiveDashboardMetricOption(alert.metric_id);
    await createNotification(client, {
      companyId,
      userId: profile.id,
      alertRuleId: alert.id,
      title: `${alert.name} triggered`,
      message: `${metric?.label ?? alert.metric_id} is ${value} (${describeAlertComparator(alert.comparator)} ${threshold}).`,
      type: "warning",
      fingerprint: buildAlertNotificationFingerprint({
        alertId: alert.id,
        frequency: alert.frequency,
        triggeredAt,
        summaryScope: summary.latestImport?.datasetVersionId ?? summary.latestImport?.id ?? summary.lastRefresh,
        threshold,
        comparator: alert.comparator,
        value,
      }),
      metadata: {
        metricId: alert.metric_id,
        value,
        threshold,
        frequency: alert.frequency,
        triggeredAt,
      },
    });
    notificationsCreated += 1;
  }

  return {
    evaluatedAlerts: alerts.length,
    notificationsCreated,
  };
}

async function fetchCompanyIdsWithEnabledAlerts(client: SupabaseClient) {
  const { data } = await client
    .schema("app")
    .from("alert_rules")
    .select("company_id")
    .eq("enabled", true)
    .throwOnError();

  return [...new Set(((data ?? []) as Array<{ company_id: string }>).map((row) => row.company_id))];
}

async function fetchEnabledAlerts(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("app")
    .from("alert_rules")
    .select("id, company_id, created_by, name, metric_id, threshold, comparator, frequency, enabled, channel")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .throwOnError();

  return (data ?? []) as AlertRow[];
}

async function fetchProfiles(client: SupabaseClient, userIds: string[]) {
  const map = new Map<string, ProfileRow>();
  if (userIds.length === 0) {
    return map;
  }

  const { data } = await client
    .schema("app")
    .from("user_profiles")
    .select("id, display_name, app_role, primary_branch_id")
    .in("id", userIds)
    .throwOnError();

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row);
  }

  return map;
}

async function fetchVehicles(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("mart")
    .from("vehicle_aging")
    .select("id, branch_id, branch_code, import_job_id, source_row_id, chassis_no, bg_date, shipment_etd_pkg, shipment_eta, date_received_by_outlet, reg_date, delivery_date, disb_date, model, payment_method, salesman_name, customer_name, is_d2d, bg_to_delivery, bg_to_shipment_etd, etd_to_outlet_received, outlet_received_to_reg, reg_to_delivery, etd_to_eta, eta_to_outlet_received, outlet_received_to_delivery, bg_to_disb, delivery_to_disb")
    .eq("company_id", companyId)
    .order("bg_date", { ascending: false })
    .throwOnError();

  return ((data ?? []) as VehicleRow[]).map((row) => ({
    branchId: row.branch_id,
    vehicle: mapVehicleRow(row),
  }));
}

async function fetchActiveQualityIssues(client: SupabaseClient, companyId: string) {
  const { data: versions } = await client
    .schema("app")
    .from("dataset_versions")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .throwOnError();

  const datasetVersionIds = ((versions ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (datasetVersionIds.length === 0) {
    return [] as DataQualityIssue[];
  }

  const { data } = await client
    .schema("app")
    .from("quality_issues")
    .select("id, chassis_no, field, issue_type, message, severity, import_job_id")
    .eq("company_id", companyId)
    .in("dataset_version_id", datasetVersionIds)
    .order("created_at", { ascending: false })
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

async function fetchImports(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("app")
    .from("import_jobs")
    .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .throwOnError();

  return ((data ?? []) as ImportJobRow[]).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    uploadedBy: row.uploaded_by ?? "Unknown User",
    uploadedAt: row.created_at,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    errorRows: row.error_rows,
    duplicateRows: row.duplicate_rows,
    publishedAt: row.published_at ?? undefined,
    previewAvailable: row.preview_available ?? false,
    datasetVersionId: row.dataset_version_id ?? undefined,
    publishMode: row.publish_mode ?? undefined,
  }));
}

async function fetchSlas(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("app")
    .from("sla_policies")
    .select("id, kpi_id, label, sla_days, company_id")
    .eq("company_id", companyId)
    .order("kpi_id", { ascending: true })
    .throwOnError();

  return ((data ?? []) as SlaRow[]).map((row) => ({
    id: row.id,
    kpiId: row.kpi_id,
    label: row.label,
    slaDays: row.sla_days,
    companyId: row.company_id,
  })) as SlaPolicy[];
}

function filterVehiclesForProfile(vehicles: VisibleVehicle[], profile: ProfileRow) {
  if (profile.primary_branch_id && ["manager", "sales", "accounts"].includes(profile.app_role)) {
    return vehicles.filter((vehicle) => vehicle.branchId === profile.primary_branch_id);
  }

  return vehicles;
}

function mapVehicleRow(row: VehicleRow): VehicleCanonical {
  return {
    id: row.id,
    chassis_no: row.chassis_no,
    bg_date: row.bg_date ?? undefined,
    shipment_etd_pkg: row.shipment_etd_pkg ?? undefined,
    shipment_eta_kk_twu_sdk: row.shipment_eta ?? undefined,
    date_received_by_outlet: row.date_received_by_outlet ?? undefined,
    reg_date: row.reg_date ?? undefined,
    delivery_date: row.delivery_date ?? undefined,
    disb_date: row.disb_date ?? undefined,
    branch_code: row.branch_code ?? "UNKNOWN",
    model: row.model ?? "Unknown",
    payment_method: row.payment_method ?? "Unknown",
    salesman_name: row.salesman_name ?? "Unknown",
    customer_name: row.customer_name ?? "Unknown",
    is_d2d: row.is_d2d,
    import_batch_id: row.import_job_id,
    source_row_id: row.source_row_id ?? row.id,
    bg_to_delivery: row.bg_to_delivery,
    bg_to_shipment_etd: row.bg_to_shipment_etd,
    etd_to_outlet_received: row.etd_to_outlet_received,
    outlet_received_to_reg: row.outlet_received_to_reg,
    reg_to_delivery: row.reg_to_delivery,
    etd_to_eta: row.etd_to_eta,
    eta_to_outlet_received: row.eta_to_outlet_received,
    outlet_received_to_delivery: row.outlet_received_to_delivery,
    bg_to_disb: row.bg_to_disb,
    delivery_to_disb: row.delivery_to_disb,
  };
}

async function createNotification(client: SupabaseClient, input: {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  fingerprint: string;
  metadata?: Record<string, string | number | boolean | null>;
  alertRuleId?: string | null;
}) {
  await client
    .schema("app")
    .from("notifications")
    .upsert({
      company_id: input.companyId,
      user_id: input.userId,
      alert_rule_id: input.alertRuleId ?? null,
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
