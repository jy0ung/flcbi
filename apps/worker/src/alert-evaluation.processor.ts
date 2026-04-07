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
} from "@flcbi/contracts";
import { getSupabaseAdminClient } from "./supabase-admin.js";
import {
  fetchProfiles,
  fetchVehicles,
  filterVehiclesForProfile,
} from "./vehicle-visibility.js";

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
