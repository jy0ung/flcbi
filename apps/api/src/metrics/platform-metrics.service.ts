import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  DependencyStatus,
  ExportJob,
  ImportBatch,
  PlatformOperationalAlert,
  PlatformMetricsSummaryResponse,
} from "@flcbi/contracts";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";
import { AlertQueueService } from "../queues/alert-queue.service.js";
import { ExportQueueService } from "../queues/export-queue.service.js";
import { ImportQueueService } from "../queues/import-queue.service.js";
import type { QueueMetricsSnapshot } from "../queues/queue.types.js";

const IMPORT_STATUSES: ImportBatch["status"][] = [
  "uploaded",
  "validating",
  "validated",
  "normalization_in_progress",
  "normalization_complete",
  "publish_in_progress",
  "published",
  "failed",
];

const EXPORT_STATUSES: ExportJob["status"][] = [
  "queued",
  "generation_in_progress",
  "completed",
  "failed",
];

@Injectable()
export class PlatformMetricsService {
  private readonly logger = new Logger(PlatformMetricsService.name);

  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
    @Inject(ImportQueueService) private readonly importQueue: ImportQueueService,
    @Inject(AlertQueueService) private readonly alertQueue: AlertQueueService,
    @Inject(ExportQueueService) private readonly exportQueue: ExportQueueService,
  ) {}

  async getMetricsSummary(): Promise<PlatformMetricsSummaryResponse> {
    const [supabase, objectStorage, importQueue, alertQueue, exportQueue] = await Promise.all([
      this.supabase.checkHealth(),
      this.objectStorage.checkHealth(),
      this.importQueue.getMetricsSnapshot(),
      this.alertQueue.getMetricsSnapshot(),
      this.exportQueue.getMetricsSnapshot(),
    ]);

    const queueHealth = summarizeQueueHealth([
      importQueue.health,
      alertQueue.health,
      exportQueue.health,
    ]);
    const ready = objectStorage !== "down" && supabase !== "down" && queueHealth !== "down";

    const summary: PlatformMetricsSummaryResponse = {
      status: ready ? "ok" : "degraded",
      ready,
      timestamp: new Date().toISOString(),
      services: {
        api: "up",
        objectStorage,
        queue: queueHealth,
        queueImports: importQueue.health,
        queueAlerts: alertQueue.health,
        queueExports: exportQueue.health,
        supabase,
      },
      mode: {
        objectStorage: "dev-local",
        auth: this.supabase.isConfigured() ? "supabase" : "fallback",
      },
      queues: {
        imports: importQueue,
        alerts: alertQueue,
        exports: exportQueue,
      },
      counts: createUnavailableCounts(),
      collectionErrors: [],
      operationalAlerts: [],
    };

    if (supabase === "up") {
      try {
        summary.counts = {
          available: true,
          ...(await this.collectSupabaseCounts()),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Supabase metrics collection failed: ${message}`);
        summary.collectionErrors.push({
          source: "supabase",
          message,
        });
      }
    }

    summary.operationalAlerts = buildOperationalAlerts(summary);

    return summary;
  }

  async renderPrometheusMetrics() {
    const summary = await this.getMetricsSummary();
    const lines: string[] = [];

    appendMetric(lines, "flcbi_health_ready", "Application readiness state", summary.ready ? 1 : 0);
    appendMetric(lines, "flcbi_dependency_up", "Dependency health state", toUpGauge(summary.services.supabase ?? "not_configured"), { dependency: "supabase" });
    appendMetric(lines, "flcbi_dependency_up", "Dependency health state", toUpGauge(summary.services.objectStorage ?? "not_configured"), { dependency: "object_storage" });
    appendMetric(lines, "flcbi_dependency_up", "Dependency health state", toUpGauge(summary.services.queue ?? "not_configured"), { dependency: "queue" });
    appendMetric(lines, "flcbi_dependency_configured", "Dependency configuration state", toConfiguredGauge(summary.services.supabase ?? "not_configured"), { dependency: "supabase" });
    appendMetric(lines, "flcbi_dependency_configured", "Dependency configuration state", toConfiguredGauge(summary.services.objectStorage ?? "not_configured"), { dependency: "object_storage" });
    appendMetric(lines, "flcbi_dependency_configured", "Dependency configuration state", toConfiguredGauge(summary.services.queue ?? "not_configured"), { dependency: "queue" });

    appendMetric(lines, "flcbi_platform_info", "Current API runtime modes", 1, {
      auth_mode: summary.mode.auth,
      object_storage_mode: summary.mode.objectStorage,
    });

    this.appendQueueMetrics(lines, "imports", summary.queues.imports);
    this.appendQueueMetrics(lines, "alerts", summary.queues.alerts);
    this.appendQueueMetrics(lines, "exports", summary.queues.exports);

    appendMetric(lines, "flcbi_supabase_metrics_available", "Supabase-backed metrics availability", summary.counts.available ? 1 : 0);

    if (summary.counts.available) {
      appendMetric(lines, "flcbi_vehicle_records_total", "Total live vehicle records", summary.counts.vehicleRecords ?? 0);

      for (const status of IMPORT_STATUSES) {
        appendMetric(lines, "flcbi_import_jobs_total", "Total import jobs by status", summary.counts.importJobs[status] ?? 0, { status });
      }

      for (const status of EXPORT_STATUSES) {
        appendMetric(lines, "flcbi_export_jobs_total", "Total export jobs by status", summary.counts.exportJobs[status] ?? 0, { status });
      }

      appendMetric(lines, "flcbi_export_subscriptions_total", "Total export subscriptions by enabled state", summary.counts.exportSubscriptions.enabled ?? 0, { enabled: "true" });
      appendMetric(lines, "flcbi_export_subscriptions_total", "Total export subscriptions by enabled state", summary.counts.exportSubscriptions.disabled ?? 0, { enabled: "false" });
      appendMetric(lines, "flcbi_alert_rules_total", "Total alert rules by enabled state", summary.counts.alertRules.enabled ?? 0, { enabled: "true" });
      appendMetric(lines, "flcbi_alert_rules_total", "Total alert rules by enabled state", summary.counts.alertRules.disabled ?? 0, { enabled: "false" });
      appendMetric(lines, "flcbi_notifications_total", "Total notifications by read state", summary.counts.notifications.unread ?? 0, { read: "false" });
      appendMetric(lines, "flcbi_notifications_total", "Total notifications by read state", summary.counts.notifications.read ?? 0, { read: "true" });
    }

    for (const error of summary.collectionErrors) {
      appendMetric(lines, "flcbi_metrics_collection_error", "Metrics collection errors by source", 1, { source: error.source });
    }

    return `${lines.join("\n")}\n`;
  }

  private appendQueueMetrics(lines: string[], queueName: string, snapshot: QueueMetricsSnapshot) {
    appendMetric(lines, "flcbi_queue_up", "Queue health state", toUpGauge(snapshot.health), { queue: queueName });
    appendMetric(lines, "flcbi_queue_configured", "Queue configuration state", toConfiguredGauge(snapshot.health), { queue: queueName });
    appendMetric(lines, "flcbi_queue_workers", "Connected workers per queue", snapshot.workers, { queue: queueName });

    for (const [state, count] of Object.entries(snapshot.counts)) {
      appendMetric(lines, "flcbi_queue_jobs", "Queue jobs by state", count, {
        queue: queueName,
        state,
      });
    }
  }

  private async collectSupabaseCounts() {
    const vehicleRecords = await this.getTableCount("app", "vehicle_records");

    const importJobsEntries = await Promise.all(
      IMPORT_STATUSES.map(async (status) => ([
        status,
        await this.getTableCount("app", "import_jobs", [{ column: "status", value: status }]),
      ] as const)),
    );
    const exportJobsEntries = await Promise.all(
      EXPORT_STATUSES.map(async (status) => ([
        status,
        await this.getTableCount("app", "export_jobs", [{ column: "status", value: status }]),
      ] as const)),
    );

    const [
      enabledSubscriptions,
      disabledSubscriptions,
      enabledAlerts,
      disabledAlerts,
      readNotifications,
      unreadNotifications,
    ] = await Promise.all([
      this.getTableCount("app", "export_subscriptions", [{ column: "enabled", value: true }]),
      this.getTableCount("app", "export_subscriptions", [{ column: "enabled", value: false }]),
      this.getTableCount("app", "alert_rules", [{ column: "enabled", value: true }]),
      this.getTableCount("app", "alert_rules", [{ column: "enabled", value: false }]),
      this.getTableCount("app", "notifications", [{ column: "read", value: true }]),
      this.getTableCount("app", "notifications", [{ column: "read", value: false }]),
    ]);

    return {
      vehicleRecords,
      importJobs: Object.fromEntries(importJobsEntries),
      exportJobs: Object.fromEntries(exportJobsEntries),
      exportSubscriptions: {
        enabled: enabledSubscriptions,
        disabled: disabledSubscriptions,
      },
      alertRules: {
        enabled: enabledAlerts,
        disabled: disabledAlerts,
      },
      notifications: {
        read: readNotifications,
        unread: unreadNotifications,
      },
    };
  }

  private async getTableCount(
    schema: "app",
    table: string,
    filters: Array<{ column: string; value: string | boolean }> = [],
  ) {
    const client = this.supabase.getAdminClient();
    let query = (client.schema(schema) as any)
      .from(table)
      .select("id", { count: "exact", head: true });

    for (const filter of filters) {
      query = query.eq(filter.column, filter.value);
    }

    const { count, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }
}

function createUnavailableCounts(): PlatformMetricsSummaryResponse["counts"] {
  return {
    available: false,
    vehicleRecords: null,
    importJobs: {},
    exportJobs: {},
    exportSubscriptions: {
      enabled: null,
      disabled: null,
    },
    alertRules: {
      enabled: null,
      disabled: null,
    },
    notifications: {
      read: null,
      unread: null,
    },
  };
}

function buildOperationalAlerts(summary: PlatformMetricsSummaryResponse): PlatformOperationalAlert[] {
  const alerts: PlatformOperationalAlert[] = [];

  if (summary.services.queue === "down") {
    alerts.push({
      code: "queue_health_down",
      severity: "error",
      title: "Queue health is down",
      message: "Background processing is unavailable. Import, alert, and export jobs may stop progressing until Redis or workers recover.",
    });
  }

  for (const [queueName, snapshot] of Object.entries(summary.queues)) {
    if (snapshot.health === "up" && snapshot.workers === 0) {
      alerts.push({
        code: `queue_workers_missing_${queueName}`,
        severity: "error",
        title: `${capitalize(queueName)} queue has no workers`,
        message: "Jobs can be accepted but nothing is currently consuming them. Check the worker process on the test server.",
      });
    }

    if (snapshot.counts.waiting > 0 && snapshot.workers === 0) {
      alerts.push({
        code: `queue_backlog_${queueName}`,
        severity: "warning",
        title: `${capitalize(queueName)} jobs are waiting`,
        message: `${snapshot.counts.waiting} queued job${snapshot.counts.waiting === 1 ? "" : "s"} are waiting without an active worker.`,
      });
    }
  }

  if (!summary.counts.available) {
    alerts.push({
      code: "supabase_counts_unavailable",
      severity: "warning",
      title: "Supabase metrics counts are unavailable",
      message: "Queue health is live, but record-level counts could not be collected from Supabase for this snapshot.",
    });
    return dedupeOperationalAlerts(alerts);
  }

  const failedImportJobs = summary.counts.importJobs.failed ?? 0;
  if (failedImportJobs > 0) {
    alerts.push({
      code: "failed_import_jobs",
      severity: "warning",
      title: "Failed import jobs need attention",
      message: `${failedImportJobs} import job${failedImportJobs === 1 ? "" : "s"} are currently failed. Review the import queue and retry or replace the workbook.`,
    });
  }

  const failedExportJobs = summary.counts.exportJobs.failed ?? 0;
  if (failedExportJobs > 0) {
    alerts.push({
      code: "failed_export_jobs",
      severity: "warning",
      title: "Failed export jobs need attention",
      message: `${failedExportJobs} export job${failedExportJobs === 1 ? "" : "s"} are currently failed. Review retries from the Operations page.`,
    });
  }

  return dedupeOperationalAlerts(alerts);
}

function dedupeOperationalAlerts(items: PlatformOperationalAlert[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.code)) {
      return false;
    }
    seen.add(item.code);
    return true;
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function summarizeQueueHealth(statuses: DependencyStatus[]): DependencyStatus {
  if (statuses.some((status) => status === "down")) {
    return "down";
  }
  if (statuses.some((status) => status === "up")) {
    return "up";
  }
  if (statuses.some((status) => status === "configured")) {
    return "configured";
  }
  return "not_configured";
}

function appendMetric(
  lines: string[],
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>,
) {
  if (!lines.includes(`# HELP ${name} ${help}`)) {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
  }

  lines.push(`${name}${formatLabels(labels)} ${value}`);
}

function formatLabels(labels?: Record<string, string>) {
  if (!labels || Object.keys(labels).length === 0) {
    return "";
  }

  const rendered = Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",");

  return `{${rendered}}`;
}

function escapeLabelValue(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"");
}

function toUpGauge(status: DependencyStatus) {
  return status === "up" ? 1 : 0;
}

function toConfiguredGauge(status: DependencyStatus) {
  return status === "not_configured" ? 0 : 1;
}
