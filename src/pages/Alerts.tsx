import React, { useMemo, useState } from "react";
import {
  EXECUTIVE_DASHBOARD_METRIC_OPTIONS,
  compareMetricValue,
  getExecutiveDashboardMetricOption,
  getExecutiveMetricValue,
  type AlertRule,
  type CreateAlertRequest,
} from "@flcbi/contracts";
import { AlertTriangle, BellRing, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import {
  useAgingSummary,
  useAlerts,
  useCreateAlert,
  useDeleteAlert,
  useUpdateAlert,
} from "@/hooks/api/use-platform";
import { cn } from "@/lib/utils";

const COMPARATOR_LABELS: Record<CreateAlertRequest["comparator"], string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

const COMPARATOR_TEXT: Record<CreateAlertRequest["comparator"], string> = {
  gt: "above",
  gte: "at or above",
  lt: "below",
  lte: "at or below",
};

const FREQUENCY_LABELS: Record<CreateAlertRequest["frequency"], string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
};

const CHANNEL_LABELS: Record<CreateAlertRequest["channel"], string> = {
  in_app: "In-app",
  email: "Email",
};

const METRIC_GROUP_LABELS: Record<(typeof EXECUTIVE_DASHBOARD_METRIC_OPTIONS)[number]["group"], string> = {
  pipeline: "Pipeline",
  operations: "Operations",
  risk: "Risk",
  kpi: "KPI Timings",
};

function createEmptyDraft(): CreateAlertRequest {
  return {
    name: "",
    metricId: EXECUTIVE_DASHBOARD_METRIC_OPTIONS[0]?.id ?? "open_stock",
    threshold: 0,
    comparator: "gte",
    frequency: "daily",
    enabled: true,
    channel: "in_app",
  };
}

function AlertForm({
  draft,
  disabled,
  onChange,
}: {
  draft: CreateAlertRequest;
  disabled: boolean;
  onChange: (patch: Partial<CreateAlertRequest>) => void;
}) {
  const metricGroups = useMemo(() => {
    const groups = new Map<string, typeof EXECUTIVE_DASHBOARD_METRIC_OPTIONS>();
    EXECUTIVE_DASHBOARD_METRIC_OPTIONS.forEach((metric) => {
      const items = groups.get(metric.group) ?? [];
      items.push(metric);
      groups.set(metric.group, items);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="alert-name">Rule name</Label>
        <Input
          id="alert-name"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Example: Watch open stock over 500"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="alert-metric">Metric</Label>
        <select
          id="alert-metric"
          value={draft.metricId}
          onChange={(event) => onChange({ metricId: event.target.value as CreateAlertRequest["metricId"] })}
          disabled={disabled}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {Array.from(metricGroups.entries()).map(([group, items]) => (
            <optgroup key={group} label={METRIC_GROUP_LABELS[group as keyof typeof METRIC_GROUP_LABELS]}>
              {items.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {getExecutiveDashboardMetricOption(draft.metricId)?.description ?? "Alert against a live dashboard metric."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="alert-comparator">Condition</Label>
          <select
            id="alert-comparator"
            value={draft.comparator}
            onChange={(event) => onChange({ comparator: event.target.value as CreateAlertRequest["comparator"] })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="gt">Greater than</option>
            <option value="gte">Greater than or equal to</option>
            <option value="lt">Less than</option>
            <option value="lte">Less than or equal to</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-threshold">Threshold</Label>
          <Input
            id="alert-threshold"
            type="number"
            min={0}
            step={1}
            value={draft.threshold}
            onChange={(event) => onChange({ threshold: Number(event.target.value) })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="alert-frequency">Frequency</Label>
          <select
            id="alert-frequency"
            value={draft.frequency}
            onChange={(event) => onChange({ frequency: event.target.value as CreateAlertRequest["frequency"] })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-channel">Notification channel</Label>
          <select
            id="alert-channel"
            value={draft.channel}
            onChange={(event) => onChange({ channel: event.target.value as CreateAlertRequest["channel"] })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="in_app">In-app</option>
            <option value="email">Email</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Rule enabled</p>
          <p className="text-xs text-muted-foreground">
            Disabled rules stay saved but will not generate notifications.
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default function Alerts() {
  const alertsQuery = useAlerts();
  const summaryQuery = useAgingSummary();
  const createAlertMutation = useCreateAlert();
  const updateAlertMutation = useUpdateAlert();
  const deleteAlertMutation = useDeleteAlert();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<AlertRule | null>(null);
  const [draft, setDraft] = useState<CreateAlertRequest>(createEmptyDraft);

  const alerts = alertsQuery.data?.items ?? [];
  const summary = summaryQuery.data?.summary;
  const activeAlerts = alerts.filter((alert) => alert.enabled).length;
  const triggeredAlerts = summary
    ? alerts.filter((alert) => (
      alert.enabled &&
      compareMetricValue(getExecutiveMetricValue(summary, alert.metricId), alert.comparator, alert.threshold)
    )).length
    : 0;

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAlert(null);
    setDraft(createEmptyDraft());
  };

  const openCreate = () => {
    setEditingAlert(null);
    setDraft(createEmptyDraft());
    setIsDialogOpen(true);
  };

  const openEdit = (alert: AlertRule) => {
    setEditingAlert(alert);
    setDraft({
      name: alert.name,
      metricId: alert.metricId,
      threshold: alert.threshold,
      comparator: alert.comparator,
      frequency: alert.frequency,
      enabled: alert.enabled,
      channel: alert.channel,
    });
    setIsDialogOpen(true);
  };

  const handleDraftChange = (patch: Partial<CreateAlertRequest>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const validateDraft = () => {
    if (!draft.name.trim()) {
      throw new Error("Rule name is required");
    }
    if (!Number.isFinite(draft.threshold) || draft.threshold < 0) {
      throw new Error("Threshold must be a number greater than or equal to 0");
    }
  };

  const handleSave = async () => {
    try {
      validateDraft();

      const payload: CreateAlertRequest = {
        name: draft.name.trim(),
        metricId: draft.metricId,
        threshold: draft.threshold,
        comparator: draft.comparator,
        frequency: draft.frequency,
        enabled: draft.enabled,
        channel: draft.channel,
      };

      if (editingAlert) {
        await updateAlertMutation.mutateAsync({ id: editingAlert.id, input: payload });
        toast.success("Alert rule updated");
      } else {
        await createAlertMutation.mutateAsync(payload);
        toast.success("Alert rule created");
      }

      closeDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save alert rule");
    }
  };

  const handleToggleEnabled = async (alert: AlertRule, enabled: boolean) => {
    try {
      await updateAlertMutation.mutateAsync({
        id: alert.id,
        input: { enabled },
      });
      toast.success(enabled ? "Alert rule enabled" : "Alert rule paused");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update alert rule");
    }
  };

  const handleDelete = async () => {
    if (!deletingAlert) {
      return;
    }

    try {
      await deleteAlertMutation.mutateAsync(deletingAlert.id);
      toast.success("Alert rule deleted");
      setDeletingAlert(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete alert rule");
    }
  };

  if (alertsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading alert rules...</div>;
  }

  if (alertsQuery.isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Alert Rules"
          description="Configure threshold-based notifications for executive metrics"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Platform" }, { label: "Alert Rules" }]}
        />
        <QueryErrorState
          title="Could not load alert rules"
          error={alertsQuery.error}
          onRetry={() => void alertsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Alert Rules"
        description="Create threshold-based notifications for the executive metrics your team watches most."
        breadcrumbs={[{ label: "FLC BI" }, { label: "Platform" }, { label: "Alert Rules" }]}
        actions={(
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Alert
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Rules</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{alerts.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Saved thresholds across executive metrics</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Enabled</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{activeAlerts}</p>
          <p className="mt-1 text-sm text-muted-foreground">Rules actively evaluating the live snapshot</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Triggering Now</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {summaryQuery.isError ? "—" : triggeredAlerts}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {summaryQuery.isError
              ? "Current dashboard values could not be loaded"
              : "Rules whose condition is met by the current summary"}
          </p>
        </div>
      </div>

      {summaryQuery.isError && (
        <div className="glass-panel border border-warning/20 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">Current metric values are temporarily unavailable</p>
              <p className="text-sm text-muted-foreground">
                You can still create and edit rules. The live trigger state will return once the dashboard summary loads again.
              </p>
            </div>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <BellRing className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold text-foreground">No alert rules yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a rule to turn executive metrics into notifications for your team.
          </p>
          <Button className="mt-5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create First Alert
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const metric = getExecutiveDashboardMetricOption(alert.metricId);
            const currentValue = summary ? getExecutiveMetricValue(summary, alert.metricId) : undefined;
            const isTriggered = currentValue != null
              ? compareMetricValue(currentValue, alert.comparator, alert.threshold)
              : false;
            const statusLabel = !alert.enabled
              ? "Paused"
              : summary
                ? (isTriggered ? "Triggered" : "Watching")
                : "Unknown";

            return (
              <div key={alert.id} className="glass-panel p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{alert.name}</h3>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium",
                          !alert.enabled
                            ? "bg-muted text-muted-foreground"
                            : isTriggered
                              ? "bg-warning/15 text-warning"
                              : "bg-success/15 text-success",
                        )}
                      >
                        {statusLabel}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                        {CHANNEL_LABELS[alert.channel]}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                        {FREQUENCY_LABELS[alert.frequency]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{metric?.label ?? alert.metricId}</p>
                    <p className="text-sm text-muted-foreground">
                      {metric?.description ?? "Live dashboard metric"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(alert)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeletingAlert(alert)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Condition</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {COMPARATOR_LABELS[alert.comparator]} {alert.threshold}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Triggers when the metric is {COMPARATOR_TEXT[alert.comparator]} {alert.threshold}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Value</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {currentValue == null ? "—" : currentValue}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summaryQuery.isError
                        ? "Waiting for dashboard summary"
                        : "Live value from the current executive snapshot"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivery</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{CHANNEL_LABELS[alert.channel]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Evaluated on a {FREQUENCY_LABELS[alert.frequency].toLowerCase()} cadence
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Enabled</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {alert.enabled ? "On" : "Off"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Toggle this rule without deleting it
                        </p>
                      </div>
                      <Switch
                        checked={alert.enabled}
                        disabled={updateAlertMutation.isPending}
                        onCheckedChange={(checked) => void handleToggleEnabled(alert, checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          return;
        }
        setIsDialogOpen(true);
      }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAlert ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle>
            <DialogDescription>
              Alert rules evaluate the same executive metrics shown on the main dashboard and generate notifications when their threshold is met.
            </DialogDescription>
          </DialogHeader>

          <AlertForm
            draft={draft}
            disabled={createAlertMutation.isPending || updateAlertMutation.isPending}
            onChange={handleDraftChange}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={createAlertMutation.isPending || updateAlertMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={createAlertMutation.isPending || updateAlertMutation.isPending}>
              {(createAlertMutation.isPending || updateAlertMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {editingAlert ? "Save Changes" : "Create Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingAlert)} onOpenChange={(open) => {
        if (!open) {
          setDeletingAlert(null);
        }
      }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAlert
                ? `This will permanently remove "${deletingAlert.name}". Existing notifications will stay in the inbox, but the rule will stop evaluating immediately.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAlertMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleteAlertMutation.isPending}>
              {deleteAlertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
