import React from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Trash2 } from "lucide-react";
import type { ExportJob, ExportSubscription } from "@flcbi/contracts";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useDeleteExportSubscription, useExports, useExportSubscriptions } from "@/hooks/api/use-platform";
import { apiClient } from "@/lib/api-client";
import { downloadBlob } from "@/lib/export";

function describeExportQuery(query: ExportJob["query"]) {
  const parts = [
    query.search ? `Search: ${query.search}` : null,
    query.branch && query.branch !== "all" ? `Branch: ${query.branch}` : null,
    query.model && query.model !== "all" ? `Model: ${query.model}` : null,
    query.payment && query.payment !== "all" ? `Payment: ${query.payment}` : null,
    query.preset ? `Preset: ${query.preset.replaceAll("_", " ")}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "All vehicles";
}

function describeSubscriptionSchedule(subscription: ExportSubscription) {
  if (subscription.schedule === "daily") {
    return "Daily";
  }
  return subscription.schedule;
}

export default function Exports() {
  const navigate = useNavigate();
  const { data, error, isError, isLoading, refetch } = useExports();
  const subscriptionsQuery = useExportSubscriptions();
  const deleteSubscription = useDeleteExportSubscription();
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = React.useState<string | null>(null);
  const exports = data?.items ?? [];
  const subscriptions = subscriptionsQuery.data?.items ?? [];
  const pendingCount = exports.filter((item) => item.status === "queued" || item.status === "generation_in_progress").length;

  const handleDownload = async (item: ExportJob) => {
    setDownloadingId(item.id);
    try {
      const download = await apiClient.downloadExport(item.id);
      downloadBlob(download.fileName, download.blob);
      toast.success(`Downloaded ${download.fileName}`);
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : "Could not download export");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteSubscription = async (item: ExportSubscription) => {
    setDeletingSubscriptionId(item.id);
    try {
      await deleteSubscription.mutateAsync(item.id);
      toast.success(`Removed ${describeSubscriptionSchedule(item).toLowerCase()} export subscription`);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Could not remove export subscription");
    } finally {
      setDeletingSubscriptionId(null);
    }
  };

  if (isLoading || subscriptionsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading exports...</div>;
  }

  const combinedError = error ?? subscriptionsQuery.error;
  if (isError || subscriptionsQuery.isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Exports"
          description="Queued CSV exports from the vehicle explorer"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Exports" }]}
        />
        <QueryErrorState
          title="Could not load exports"
          error={combinedError}
          onRetry={() => {
            void refetch();
            void subscriptionsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Exports"
        description="Queued CSV exports from the vehicle explorer"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Exports" }]}
        actions={(
          <Button variant="outline" size="sm" onClick={() => navigate("/auto-aging/vehicles")}>
            Back to Explorer
          </Button>
        )}
      />

      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{pendingCount} exports in progress</p>
          <p className="text-xs text-muted-foreground">
            Completed exports stay here until you download or replace them with a newer request.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {subscriptions.length} subscriptions · {exports.length} total exports
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Daily Export Subscriptions</p>
            <p className="text-xs text-muted-foreground">
              Save a filtered vehicle explorer view and the scheduler will queue a CSV every morning.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/auto-aging/vehicles")}>
            Create from Explorer
          </Button>
        </div>
        <table className="w-full text-sm" data-testid="export-subscriptions-table">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Schedule</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created By</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Filters</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Last Triggered</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="export-subscriptions-empty">
                  No scheduled exports yet. Save one from the Vehicle Explorer.
                </td>
              </tr>
            )}
            {subscriptions.map((item) => (
              <tr key={item.id} className="data-table-row" data-testid="export-subscription-row">
                <td className="px-4 py-3">
                  <div className="text-xs font-medium text-primary">{describeSubscriptionSchedule(item)}</div>
                  <div className="text-[11px] text-muted-foreground">{item.kind.replaceAll("_", " ")}</div>
                </td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {item.requestedBy}
                  <div className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{describeExportQuery(item.query)}</td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {item.lastTriggeredAt ? new Date(item.lastTriggeredAt).toLocaleString() : "Not triggered yet"}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteSubscription(item)}
                    disabled={deletingSubscriptionId === item.id}
                  >
                    {deletingSubscriptionId === item.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-4 w-4" />
                    )}
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm" data-testid="exports-table">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">File</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Requested</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Filters</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Rows</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {exports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="exports-empty">
                  No exports have been requested yet.
                </td>
              </tr>
            )}
            {exports.map((item) => (
              <tr key={item.id} className="data-table-row" data-testid="exports-row">
                <td className="px-4 py-3">
                  <div className="text-xs font-medium text-primary">{item.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">{item.requestedBy}</div>
                </td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {new Date(item.requestedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {describeExportQuery(item.query)}
                  {item.attemptCount != null && item.maxAttempts != null && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Attempts: {item.attemptCount}/{item.maxAttempts}
                    </div>
                  )}
                  {item.errorMessage && (
                    <div className="mt-1 text-[11px] text-destructive">{item.errorMessage}</div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-foreground">{item.totalRows}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownload(item)}
                    disabled={item.status !== "completed" || downloadingId === item.id}
                  >
                    {downloadingId === item.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-4 w-4" />
                    )}
                    Download
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
