import React from "react";
import type { ExportJob, ImportBatch } from "@flcbi/contracts";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useExports, useImports, usePlatformHealth, usePublishImport, useRetryExport } from "@/hooks/api/use-platform";

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
  const health = usePlatformHealth();
  const imports = useImports();
  const exportsQuery = useExports();
  const publishImport = usePublishImport();
  const retryExport = useRetryExport();
  const [retryingImportId, setRetryingImportId] = React.useState<string | null>(null);
  const [retryingExportId, setRetryingExportId] = React.useState<string | null>(null);

  if (health.isLoading || imports.isLoading || exportsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading operations data...</div>;
  }

  const error = health.error ?? imports.error ?? exportsQuery.error;
  if (health.isError || imports.isError || exportsQuery.isError) {
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
            void health.refetch();
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
        description="Queue health and background job visibility"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Admin" }, { label: "Operations" }]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(health.data?.services ?? {}).map(([key, value]) => (
          <DependencyCard key={key} label={key} status={value} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Import Jobs</div>
          <div className="mt-2 text-sm text-foreground">
            {importSummary.total} total, {importSummary.pending} pending, {importSummary.failed} failed
          </div>
        </div>
        <div className="glass-panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Export Jobs</div>
          <div className="mt-2 text-sm text-foreground">
            {exportSummary.total} total, {exportSummary.pending} pending, {exportSummary.failed} failed
          </div>
        </div>
      </div>

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
