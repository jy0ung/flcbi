import type { SupabaseClient } from "@supabase/supabase-js";
import { Queue, type Job } from "bullmq";
import {
  EXPORT_DAILY_SUBSCRIPTIONS_JOB_NAME,
  EXPORT_GENERATE_JOB_NAME,
  EXPORT_QUEUE_NAME,
  buildVehicleExplorerExportRows,
  filterVehiclesForExplorer,
  serializeCsvRows,
  sortVehiclesForExplorer,
  type ExportDailySubscriptionsJobPayload,
  type ExportGenerateJobPayload,
  type ExplorerQuery,
  type Notification,
} from "@flcbi/contracts";
import { getExportBucket, getSupabaseAdminClient, runBestEffort } from "./supabase-admin.js";
import { fetchProfiles, fetchVehicles, filterVehiclesForProfile } from "./vehicle-visibility.js";

interface ExportJobRow {
  id: string;
  company_id: string;
  requested_by: string | null;
  kind: string;
  format: string;
  status: string;
  file_name: string;
  query_definition: ExplorerQuery | null;
  total_rows: number;
  storage_path: string | null;
  error_message: string | null;
  completed_at: string | null;
  processing_started_at: string | null;
  last_error_at: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  created_at: string;
}

interface ExportSubscriptionRow {
  id: string;
  company_id: string;
  requested_by: string;
  kind: string;
  schedule: string;
  enabled: boolean;
  query_definition: ExplorerQuery | null;
  last_triggered_at: string | null;
  last_export_job_id: string | null;
}

let scheduledExportQueue: Queue<ExportGenerateJobPayload> | undefined;

export async function processExportJob(
  job: Job<ExportGenerateJobPayload | ExportDailySubscriptionsJobPayload>,
) {
  if (job.name === EXPORT_DAILY_SUBSCRIPTIONS_JOB_NAME) {
    return processDailySubscriptionExports((job.data as ExportDailySubscriptionsJobPayload).triggeredAt);
  }

  if (job.name !== EXPORT_GENERATE_JOB_NAME) {
    return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
  }

  const client = getSupabaseAdminClient();
  const exportJob = await fetchExportJob(client, (job.data as ExportGenerateJobPayload).exportId);
  const attemptCount = job.attemptsMade + 1;
  const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  if (!exportJob) {
    throw new Error(`Export ${(job.data as ExportGenerateJobPayload).exportId} was not found`);
  }

  try {
    if (exportJob.status === "completed") {
      return { ok: true, skipped: true, exportId: exportJob.id, status: exportJob.status };
    }
    if (!exportJob.requested_by) {
      throw new Error(`Export ${exportJob.id} is missing a requesting user`);
    }

    await updateExportStatus(client, exportJob.company_id, exportJob.id, {
      status: "generation_in_progress",
      processing_started_at: new Date().toISOString(),
      error_message: null,
      last_error_at: null,
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
    });

    const profiles = await fetchProfiles(client, [exportJob.requested_by]);
    const profile = profiles.get(exportJob.requested_by);
    if (!profile) {
      throw new Error(`Profile ${exportJob.requested_by} was not found`);
    }

    const normalizedQuery = normalizeExportQuery(exportJob.query_definition ?? defaultExportQuery());
    const scopedVehicles = filterVehiclesForProfile(
      await fetchVehicles(client, exportJob.company_id),
      profile,
    ).map((item) => item.vehicle);
    const vehicles = sortVehiclesForExplorer(
      filterVehiclesForExplorer(scopedVehicles, normalizedQuery),
      normalizedQuery,
    );
    const csv = serializeCsvRows(buildVehicleExplorerExportRows(vehicles));
    const storagePath = `${exportJob.company_id}/exports/${exportJob.id}/${exportJob.file_name}`;
    const upload = await client.storage
      .from(getExportBucket())
      .upload(storagePath, Buffer.from(csv, "utf8"), {
        contentType: "text/csv",
        upsert: true,
      });

    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const completedAt = new Date().toISOString();
    await updateExportStatus(client, exportJob.company_id, exportJob.id, {
      status: "completed",
      total_rows: vehicles.length,
      storage_path: storagePath,
      completed_at: completedAt,
      error_message: null,
      last_error_at: null,
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
    });

    await runBestEffort(`export_complete_audit:${exportJob.id}`, async () => {
      await addAuditEvent(client, {
        companyId: exportJob.company_id,
        userId: exportJob.requested_by!,
        userName: profile.display_name,
        action: "export_completed",
        entity: "export_job",
        entityId: exportJob.id,
        details: `Generated ${exportJob.file_name} with ${vehicles.length} vehicle rows`,
      });
    });

    await runBestEffort(`export_complete_notification:${exportJob.id}`, async () => {
      await createNotification(client, {
        companyId: exportJob.company_id,
        userId: exportJob.requested_by!,
        title: `Export ready: ${exportJob.file_name}`,
        message: `${vehicles.length} vehicles were prepared for download.`,
        type: "success",
        fingerprint: `export-complete:${exportJob.id}`,
        metadata: {
          exportId: exportJob.id,
          totalRows: vehicles.length,
        },
      });
    });

    return {
      ok: true,
      exportId: exportJob.id,
      totalRows: vehicles.length,
    };
  } catch (error) {
    await runBestEffort(`export_attempt_failure:${exportJob.id}`, async () => {
      await updateExportStatus(client, exportJob.company_id, exportJob.id, {
        last_error_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        attempt_count: attemptCount,
        max_attempts: maxAttempts,
      });
    });
    if (job.attemptsMade + 1 >= maxAttempts) {
      await runBestEffort(`export_mark_failed:${exportJob.id}`, async () => {
        await updateExportStatus(client, exportJob.company_id, exportJob.id, {
          status: "failed",
          last_error_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : String(error),
          attempt_count: attemptCount,
          max_attempts: maxAttempts,
        });
      });
      if (exportJob.requested_by) {
        const profiles = await fetchProfiles(client, [exportJob.requested_by]);
        const profile = profiles.get(exportJob.requested_by);
        await runBestEffort(`export_failure_audit:${exportJob.id}`, async () => {
          await addAuditEvent(client, {
            companyId: exportJob.company_id,
            userId: exportJob.requested_by!,
            userName: profile?.display_name ?? exportJob.requested_by!,
            action: "export_failed",
            entity: "export_job",
            entityId: exportJob.id,
            details: `Export generation failed for ${exportJob.file_name}: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
        await runBestEffort(`export_failure_notification:${exportJob.id}`, async () => {
          await createNotification(client, {
            companyId: exportJob.company_id,
            userId: exportJob.requested_by!,
            title: `Export failed: ${exportJob.file_name}`,
            message: "The queued export did not finish. Please retry the export request.",
            type: "error",
            fingerprint: `export-failed:${exportJob.id}`,
            metadata: {
              exportId: exportJob.id,
            },
          });
        });
      }
    }

    throw error;
  }
}

async function processDailySubscriptionExports(triggeredAt: string) {
  const client = getSupabaseAdminClient();
  const subscriptions = await fetchEnabledExportSubscriptions(client);
  if (subscriptions.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: "no enabled export subscriptions",
      triggeredAt,
    };
  }

  const runKey = buildScheduledRunKey(triggeredAt);
  const profiles = await fetchProfiles(client, subscriptions.map((subscription) => subscription.requested_by));
  let created = 0;
  let skipped = 0;

  for (const subscription of subscriptions) {
    const profile = profiles.get(subscription.requested_by);
    if (!profile) {
      skipped += 1;
      continue;
    }

    const fileName = buildScheduledExportFileName(triggeredAt, subscription.id);
    const normalizedQuery = normalizeExportQuery(subscription.query_definition ?? defaultExportQuery());

    try {
      const { data, error } = await client
        .schema("app")
        .from("export_jobs")
        .insert({
          company_id: subscription.company_id,
          requested_by: subscription.requested_by,
          kind: subscription.kind,
          format: "csv",
          status: "queued",
          file_name: fileName,
          query_definition: normalizedQuery,
          attempt_count: 0,
          max_attempts: 3,
          subscription_id: subscription.id,
          scheduled_run_key: runKey,
        })
        .select("id")
        .single();

      if (error?.code === "23505") {
        skipped += 1;
        continue;
      }
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to create scheduled export job");
      }

      await updateExportSubscription(client, subscription.company_id, subscription.id, {
        last_triggered_at: triggeredAt,
        last_export_job_id: data.id,
      });

      try {
        await getScheduledExportQueue().add(EXPORT_GENERATE_JOB_NAME, { exportId: data.id }, {
          jobId: `export-generate-${data.id}`,
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
      } catch (queueError) {
        await updateExportStatus(client, subscription.company_id, data.id, {
          status: "failed",
          last_error_at: new Date().toISOString(),
          error_message: queueError instanceof Error ? queueError.message : String(queueError),
          attempt_count: 0,
          max_attempts: 3,
        });
        throw queueError;
      }

      created += 1;

      await runBestEffort(`export_subscription_enqueued_audit:${subscription.id}:${data.id}`, async () => {
        await addAuditEvent(client, {
          companyId: subscription.company_id,
          userId: subscription.requested_by,
          userName: profile.display_name,
          action: "export_subscription_enqueued",
          entity: "export_subscription",
          entityId: subscription.id,
          details: `Queued daily export ${fileName}`,
        });
      });
    } catch (error) {
      skipped += 1;
      await runBestEffort(`export_subscription_failure_audit:${subscription.id}`, async () => {
        await addAuditEvent(client, {
          companyId: subscription.company_id,
          userId: subscription.requested_by,
          userName: profile.display_name,
          action: "export_subscription_failed",
          entity: "export_subscription",
          entityId: subscription.id,
          details: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  return {
    ok: true,
    triggeredAt,
    created,
    skipped,
  };
}

async function fetchExportJob(client: SupabaseClient, exportId: string) {
  const { data } = await client
    .schema("app")
    .from("export_jobs")
    .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
    .eq("id", exportId)
    .maybeSingle()
    .throwOnError();

  return (data as ExportJobRow | null) ?? null;
}

async function fetchEnabledExportSubscriptions(client: SupabaseClient) {
  const { data } = await client
    .schema("app")
    .from("export_subscriptions")
    .select("id, company_id, requested_by, kind, schedule, enabled, query_definition, last_triggered_at, last_export_job_id")
    .eq("enabled", true)
    .eq("schedule", "daily")
    .order("created_at", { ascending: true })
    .throwOnError();

  return (data ?? []) as ExportSubscriptionRow[];
}

async function updateExportStatus(
  client: SupabaseClient,
  companyId: string,
  exportId: string,
  input: Record<string, unknown>,
) {
  await client
    .schema("app")
    .from("export_jobs")
    .update(input)
    .eq("company_id", companyId)
    .eq("id", exportId)
    .throwOnError();
}

async function updateExportSubscription(
  client: SupabaseClient,
  companyId: string,
  subscriptionId: string,
  input: Record<string, unknown>,
) {
  await client
    .schema("app")
    .from("export_subscriptions")
    .update(input)
    .eq("company_id", companyId)
    .eq("id", subscriptionId)
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
      metadata: {
        userName: input.userName,
      },
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

function defaultExportQuery(): ExplorerQuery {
  return {
    branch: "all",
    model: "all",
    payment: "all",
    page: 1,
    pageSize: 100,
    sortField: "bg_to_delivery",
    sortDirection: "desc",
  };
}

function normalizeExportQuery(query: ExplorerQuery): ExplorerQuery {
  return {
    search: query.search?.trim() || undefined,
    branch: query.branch ?? "all",
    model: query.model ?? "all",
    payment: query.payment ?? "all",
    preset: query.preset,
    page: 1,
    pageSize: 100,
    sortField: query.sortField ?? "bg_to_delivery",
    sortDirection: query.sortDirection ?? "desc",
  };
}

function buildScheduledRunKey(triggeredAt: string) {
  const date = new Date(triggeredAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildScheduledExportFileName(triggeredAt: string, subscriptionId: string) {
  const compact = triggeredAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `vehicle-explorer-${compact}-${subscriptionId.slice(0, 8)}.csv`;
}

function getScheduledExportQueue() {
  if (!scheduledExportQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is not configured");
    }

    scheduledExportQueue = new Queue<ExportGenerateJobPayload>(EXPORT_QUEUE_NAME, {
      connection: { url: redisUrl },
    });
  }

  return scheduledExportQueue;
}
