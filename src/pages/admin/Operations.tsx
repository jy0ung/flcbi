import React from "react";
import type { ExportJob, ImportBatch, QueueMetricsSummary } from "@flcbi/contracts";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  useExports,
  useImports,
  usePlatformMetricsSummary,
  usePublishImport,
  useRetryExport,
} from "@/hooks/api/use-platform";

function isPendingStatus(status?: string) {
  return status === "uploaded"
    || status === "validating"
    || status === "normalization_in_progress"
    || status === "publish_in_progress"
    || status === "queued"
    || status === "generation_in_progress";
}

function formatAttempts(item: { attemptCount?: number; maxAttempts?: number }) {
  return `${item.attemptCount ?? 0}/${item.maxAttempts ?? 0}`;
}

function summarizeJobs(items: Array<{ status: string }>) {
  return {
    total: items.length,
    pending: items.filter((item) => isPendingStatus(item.status)).length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

function renderJobError(item: { errorMessage?: string; lastErrorAt?: string }) {
  if (!item.errorMessage) {
    return <span className="text-muted-foreground">No recent error</span>;
  }

  return (
    <div className="space-y-1">
      <div className="text-destructive">{item.errorMessage}</div>
      {item.lastErrorAt && (
        <div className="text-[11px] text-muted-foreground">
          {new Date(item.lastErrorAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function formatCount(value?: number | null) {
  if (value == null) {
    return "Unavailable";
  }

  return value.toLocaleString();
}

function sumRecordValues(items: Record<string, number | undefined> | undefined) {
  return Object.values(items ?? {}).reduce((total, count) => total + (count ?? 0), 0);
}

const EMPTY_QUEUE_METRICS: QueueMetricsSummary = {
  health: "not_configured",
  workers: 0,
  counts: {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
  },
};

function DependencyCard({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  return (
    <div className="glass-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-sm text-foreground">{status.replaceAll("_", " ")}</span>
      </div>
    </div>
  );
}

function QueueMetricsCard({
  label,
  snapshot,
  testId,
}: {
  label: string;
  snapshot: QueueMetricsSummary;
  testId: string;
}) {
  return (
    <div className="glass-panel p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={snapshot.health} />
            <span className="text-sm text-foreground">{snapshot.health.replaceAll("_", " ")}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Workers</div>
          <div className="mt-2 text-lg font-semibold text-foreground">{snapshot.workers}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Waiting</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.waiting)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.active)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Failed</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.failed)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Completed</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.completed)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Delayed</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.delayed)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paused</div>
          <div className="mt-1 text-sm font-medium text-foreground">{formatCount(snapshot.counts.paused)}</div>
        </div>
      </div>
    </div>
  );
}

function MetricSummaryCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  testId: string;
}) {
  return (
    <div className="glass-panel p-4" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function ImportJobsTable({
  items,
  onRetry,
  retryingId,
}: {
  items: ImportBatch[];
  onRetry: (item: ImportBatch) => void;
  retryingId: string | null;
}) {
  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm" data-testid="operations-imports-table">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-left">
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">File</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Attempts</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Started</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Last Error</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                No import jobs yet.
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.id} className="data-table-row">
              <td className="px-4 py-3">
                <div className="text-xs font-medium text-primary">{item.fileName}</div>
                <div className="text-[11px] text-muted-foreground">{item.uploadedBy}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">{formatAttempts(item)}</td>
              <td className="px-4 py-3 text-xs text-foreground">
                {item.processingStartedAt ? new Date(item.processingStartedAt).toLocaleString() : "Not started"}
              </td>
              <td className="px-4 py-3 text-xs">
                {renderJobError(item)}
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(item)}
                  disabled={!item.canRetryPublish || retryingId === item.id}
                >
                  Retry Publish
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportJobsTable({
  items,
  onRetry,
  retryingId,
}: {
  items: ExportJob[];
  onRetry: (item: ExportJob) => void;
  retryingId: string | null;
}) {
  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm" data-testid="operations-exports-table">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-left">
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">File</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Attempts</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Started</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Last Error</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                No export jobs yet.
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.id} className="data-table-row">
              <td className="px-4 py-3">
                <div className="text-xs font-medium text-primary">{item.fileName}</div>
                <div className="text-[11px] text-muted-foreground">{item.requestedBy}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">{formatAttempts(item)}</td>
              <td className="px-4 py-3 text-xs text-foreground">
                {item.processingStartedAt ? new Date(item.processingStartedAt).toLocaleString() : "Not started"}
              </td>
              <td className="px-4 py-3 text-xs">
                {renderJobError(item)}
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(item)}
                  disabled={!item.canRetry || retryingId === item.id}
                >
                  Retry Export
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Operations() {
  const metrics = usePlatformMetricsSummary();
  const imports = useImports();
  const exportsQuery = useExports();
  const publishImport = usePublishImport();
  const retryExport = useRetryExport();
  const [retryingImportId, setRetryingImportId] = React.useState<string | null>(null);
  const [retryingExportId, setRetryingExportId] = React.useState<string | null>(null);

  if (metrics.isLoading || imports.isLoading || exportsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading operations data...</div>;
  }

  const error = metrics.error ?? imports.error ?? exportsQuery.error;
  if (metrics.isError || imports.isError || exportsQuery.isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Operations"
          description="Queue health and background job visibility"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Admin" }, { label: "Operations" }]}
        />
        <QueryErrorState
          title="Could not load operations view"
          error={error}
          onRetry={() => {
            void metrics.refetch();
            void imports.refetch();
            void exportsQuery.refetch();
          }}
        />
      </div>
    );
  }

  const importItems = imports.data?.items ?? [];
  const exportItems = exportsQuery.data?.items ?? [];
  const importSummary = summarizeJobs(importItems);
  const exportSummary = summarizeJobs(exportItems);
  const metricsData = metrics.data;
  const counts = metricsData?.counts;
  const importJobTotal = counts?.available ? sumRecordValues(counts.importJobs) : importSummary.total;
  const exportJobTotal = counts?.available ? sumRecordValues(counts.exportJobs) : exportSummary.total;
  const importFailed = counts?.available ? (counts.importJobs.failed ?? 0) : importSummary.failed;
  const exportFailed = counts?.available ? (counts.exportJobs.failed ?? 0) : exportSummary.failed;
  const importPending = counts?.available
    ? (counts.importJobs.uploaded ?? 0)
      + (counts.importJobs.validating ?? 0)
      + (counts.importJobs.normalization_in_progress ?? 0)
      + (counts.importJobs.publish_in_progress ?? 0)
    : importSummary.pending;
  const exportPending = counts?.available
    ? (counts.exportJobs.queued ?? 0) + (counts.exportJobs.generation_in_progress ?? 0)
    : exportSummary.pending;

  const handleRetryImport = async (item: ImportBatch) => {
    if (!item.canRetryPublish) {
      return;
    }

    setRetryingImportId(item.id);
    try {
      await publishImport.mutateAsync({ id: item.id, mode: item.publishMode ?? "replace" });
      toast.success(`Requeued publish for ${item.fileName}`);
      void imports.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry import publish");
    } finally {
      setRetryingImportId(null);
    }
  };

  const handleRetryExport = async (item: ExportJob) => {
    if (!item.canRetry) {
      return;
    }

    setRetryingExportId(item.id);
    try {
      await retryExport.mutateAsync(item.id);
      toast.success(`Requeued export for ${item.fileName}`);
      void exportsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry export");
    } finally {
      setRetryingExportId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Operations"
        description="Queue health, worker pressure, and background job visibility"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Admin" }, { label: "Operations" }]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(metricsData?.services ?? {}).map(([key, value]) => (
          <DependencyCard key={key} label={key} status={value} />
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Queue Snapshot</h2>
            <p className="text-xs text-muted-foreground">
              Worker presence and BullMQ backlog as of {metricsData?.timestamp ? new Date(metricsData.timestamp).toLocaleString() : "now"}.
            </p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <QueueMetricsCard
            label="Imports Queue"
            snapshot={metricsData?.queues.imports ?? EMPTY_QUEUE_METRICS}
            testId="operations-queue-imports"
          />
          <QueueMetricsCard
            label="Alerts Queue"
            snapshot={metricsData?.queues.alerts ?? EMPTY_QUEUE_METRICS}
            testId="operations-queue-alerts"
          />
          <QueueMetricsCard
            label="Exports Queue"
            snapshot={metricsData?.queues.exports ?? EMPTY_QUEUE_METRICS}
            testId="operations-queue-exports"
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricSummaryCard
          label="Vehicle Records"
          value={formatCount(counts?.vehicleRecords)}
          hint="Live canonical records in the current dataset"
          testId="operations-metric-vehicle-records"
        />
        <MetricSummaryCard
          label="Import Jobs"
          value={formatCount(importJobTotal)}
          hint={`${formatCount(importPending)} pending, ${formatCount(importFailed)} failed`}
          testId="operations-metric-import-jobs"
        />
        <MetricSummaryCard
          label="Export Jobs"
          value={formatCount(exportJobTotal)}
          hint={`${formatCount(exportPending)} pending, ${formatCount(exportFailed)} failed`}
          testId="operations-metric-export-jobs"
        />
        <MetricSummaryCard
          label="Unread Notifications"
          value={formatCount(counts?.notifications.unread)}
          hint="Persisted in-app notifications still unread"
          testId="operations-metric-notifications"
        />
        <MetricSummaryCard
          label="Enabled Alert Rules"
          value={formatCount(counts?.alertRules.enabled)}
          hint="Active threshold rules scheduled for evaluation"
          testId="operations-metric-alert-rules"
        />
        <MetricSummaryCard
          label="Active Export Schedules"
          value={formatCount(counts?.exportSubscriptions.enabled)}
          hint="Daily export subscriptions currently enabled"
          testId="operations-metric-export-subscriptions"
        />
      </div>

      {metricsData?.collectionErrors && metricsData.collectionErrors.length > 0 && (
        <div className="glass-panel border border-warning/30 p-4" data-testid="operations-metrics-errors">
          <div className="text-xs uppercase tracking-wide text-warning">Metrics Collection Warnings</div>
          <div className="mt-2 space-y-2 text-sm text-foreground">
            {metricsData.collectionErrors.map((item) => (
              <div key={`${item.source}:${item.message}`}>
                <span className="font-medium text-warning">{item.source}</span>: {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Imports</h2>
          <p className="text-xs text-muted-foreground">Validation and publish work tracked from the queue path.</p>
        </div>
        <ImportJobsTable
          items={importItems.slice(0, 12)}
          onRetry={(item) => void handleRetryImport(item)}
          retryingId={retryingImportId}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Exports</h2>
          <p className="text-xs text-muted-foreground">Manual vehicle explorer exports and their latest worker outcome.</p>
        </div>
        <ExportJobsTable
          items={exportItems.slice(0, 12)}
          onRetry={(item) => void handleRetryExport(item)}
          retryingId={retryingExportId}
        />
      </section>
    </div>
  );
}
