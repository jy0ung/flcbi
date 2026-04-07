import React from "react";
import {
  VEHICLE_CORRECTION_FIELD_LABELS,
  type UpdateVehicleCorrectionsRequest,
  type VehicleCanonical,
  type VehicleCorrectionField,
} from "@flcbi/contracts";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle, Clock, Loader2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { KPI_DEFINITIONS } from "@/data/kpi-definitions";
import { ApiError } from "@/lib/api-client";
import { useUpdateVehicleCorrections, useVehicleDetail } from "@/hooks/api/use-platform";

const DATE_FIELDS = [
  "bg_date",
  "shipment_etd_pkg",
  "date_received_by_outlet",
  "reg_date",
  "delivery_date",
  "disb_date",
] as const satisfies readonly VehicleCorrectionField[];

const TEXT_FIELDS = [
  "payment_method",
  "salesman_name",
  "customer_name",
  "remark",
] as const satisfies readonly VehicleCorrectionField[];

const EDITABLE_FIELDS = [...DATE_FIELDS, ...TEXT_FIELDS] as const;

type EditableVehicleField = typeof EDITABLE_FIELDS[number];

type VehicleCorrectionDraft = Omit<UpdateVehicleCorrectionsRequest, "reason">;

function buildDraft(vehicle?: VehicleCanonical): VehicleCorrectionDraft {
  return {
    bg_date: vehicle?.bg_date ?? "",
    shipment_etd_pkg: vehicle?.shipment_etd_pkg ?? "",
    date_received_by_outlet: vehicle?.date_received_by_outlet ?? "",
    reg_date: vehicle?.reg_date ?? "",
    delivery_date: vehicle?.delivery_date ?? "",
    disb_date: vehicle?.disb_date ?? "",
    payment_method: vehicle?.payment_method ?? "",
    salesman_name: vehicle?.salesman_name ?? "",
    customer_name: vehicle?.customer_name ?? "",
    remark: vehicle?.remark ?? "",
  };
}

function getVehicleFieldValue(vehicle: VehicleCanonical, field: EditableVehicleField) {
  return (vehicle[field] as string | undefined) ?? "";
}

function normalizeDraftValue(field: EditableVehicleField, value: string) {
  if (field === "remark") {
    return value.trim();
  }
  if (field === "payment_method" || field === "salesman_name" || field === "customer_name") {
    return value.trim();
  }
  return value.trim();
}

function formatCorrectionTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function VehicleDetail() {
  const { chassisNo } = useParams<{ chassisNo: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEditCorrections = hasRole(["company_admin", "super_admin", "director"]);
  const { data, error, isError, isLoading, refetch } = useVehicleDetail(chassisNo);
  const updateCorrections = useUpdateVehicleCorrections();
  const vehicle = data?.vehicle;
  const issues = data?.issues ?? [];
  const corrections = data?.corrections ?? [];
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<VehicleCorrectionDraft>(buildDraft());
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!isDialogOpen || !vehicle) {
      return;
    }

    setDraft(buildDraft(vehicle));
    setReason("");
  }, [isDialogOpen, vehicle]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading vehicle detail...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader title="Vehicle Detail" />
        <QueryErrorState
          title="Could not load vehicle detail"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader title="Vehicle Not Found" />
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  const milestones = [
    { label: "BG Date", date: vehicle.bg_date },
    { label: "Shipment ETD", date: vehicle.shipment_etd_pkg },
    { label: "Outlet Received", date: vehicle.date_received_by_outlet },
    { label: "Register Date", date: vehicle.reg_date },
    { label: "Delivery", date: vehicle.delivery_date },
    { label: "Disbursement", date: vehicle.disb_date },
  ];

  const kpiValues = KPI_DEFINITIONS.map((kpi) => ({
    label: kpi.shortLabel,
    value: vehicle[kpi.computedField] as number | null,
    sla: kpi.slaDefault,
  }));

  async function handleSaveCorrections() {
    if (!vehicle) {
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      toast.error("Please add a short reason for the correction.");
      return;
    }

    const input: UpdateVehicleCorrectionsRequest = { reason: trimmedReason };
    let changedCount = 0;

    for (const field of EDITABLE_FIELDS) {
      const nextValue = normalizeDraftValue(field, draft[field] ?? "");
      const currentValue = normalizeDraftValue(field, getVehicleFieldValue(vehicle, field));
      if (nextValue === currentValue) {
        continue;
      }

      input[field] = nextValue;
      changedCount += 1;
    }

    if (changedCount === 0) {
      toast.info("No vehicle changes to save.");
      return;
    }

    try {
      await updateCorrections.mutateAsync({
        chassisNo: vehicle.chassis_no,
        input,
      });
      toast.success("Vehicle corrections saved.");
      setIsDialogOpen(false);
    } catch (saveError) {
      const message = saveError instanceof ApiError ? saveError.message : "Could not save vehicle corrections";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={vehicle.chassis_no}
        description={`${vehicle.model} • ${vehicle.branch_code} • ${vehicle.customer_name}`}
        breadcrumbs={[
          { label: "FLC BI" },
          { label: "Auto Aging" },
          { label: "Vehicles" },
          { label: vehicle.chassis_no },
        ]}
        actions={(
          <div className="flex items-center gap-2">
            {canEditCorrections && (
              <Button variant="default" size="sm" onClick={() => setIsDialogOpen(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit Vehicle
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Vehicle Information</h3>
            {corrections.length > 0 && (
              <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                {corrections.length} manual correction{corrections.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Chassis No.", vehicle.chassis_no],
              ["Model", vehicle.model],
              ["Branch", vehicle.branch_code],
              ["Payment", vehicle.payment_method],
              ["Salesman", vehicle.salesman_name],
              ["Customer", vehicle.customer_name],
              ["D2D/Transfer", vehicle.is_d2d ? "Yes" : "No"],
              ["Remarks", vehicle.remark || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Milestone Timeline</h3>
          <div className="space-y-3">
            {milestones.map((milestone, index) => (
              <div key={milestone.label} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${milestone.date ? "bg-success/15" : "bg-muted"}`}>
                    {milestone.date ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {index < milestones.length - 1 && <div className="mt-1 h-4 w-0.5 bg-border" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{milestone.label}</p>
                  <p className="text-sm font-medium text-foreground">{milestone.date || "Pending"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">KPI Breakdown</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {kpiValues.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border/50 bg-secondary/50 p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
              {kpi.value != null ? (
                <p className={`text-xl font-bold tabular-nums ${kpi.value < 0 ? "text-destructive" : kpi.value > kpi.sla ? "text-warning" : "text-foreground"}`}>
                  {kpi.value}
                  <span className="ml-0.5 text-xs text-muted-foreground">d</span>
                </p>
              ) : (
                <p className="text-xl font-bold text-muted-foreground">—</p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">SLA: {kpi.sla}d</p>
            </div>
          ))}
        </div>
      </div>

      {corrections.length > 0 && (
        <div className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Manual Corrections</h3>
              <p className="text-xs text-muted-foreground">
                These overrides sit on top of the published import data and are included in explorer, summary, alerts, and exports.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {corrections.map((correction) => (
              <div key={correction.id} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {VEHICLE_CORRECTION_FIELD_LABELS[correction.field]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Current override: {correction.value || "Cleared"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatCorrectionTimestamp(correction.updatedAt)}</p>
                </div>
                <p className="mt-2 text-sm text-foreground">{correction.reason}</p>
                {correction.updatedByName && (
                  <p className="mt-1 text-xs text-muted-foreground">Updated by {correction.updatedByName}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="glass-panel p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Data Quality Issues
          </h3>
          <div className="space-y-2">
            {issues.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between rounded bg-secondary/50 p-2">
                <span className="text-sm text-foreground">{issue.message}</span>
                <StatusBadge status={issue.severity} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Vehicle Corrections</DialogTitle>
            <DialogDescription>
              Save audited manual corrections for this vehicle. These changes survive future import publishes until they are reset back to the source value.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              {DATE_FIELDS.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`vehicle-${field}`}>{VEHICLE_CORRECTION_FIELD_LABELS[field]}</Label>
                  <Input
                    id={`vehicle-${field}`}
                    type="date"
                    value={draft[field] ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    disabled={updateCorrections.isPending}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {TEXT_FIELDS.filter((field) => field !== "remark").map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`vehicle-${field}`}>{VEHICLE_CORRECTION_FIELD_LABELS[field]}</Label>
                  <Input
                    id={`vehicle-${field}`}
                    value={draft[field] ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    disabled={updateCorrections.isPending}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicle-remark">Remark</Label>
              <Textarea
                id="vehicle-remark"
                value={draft.remark ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
                disabled={updateCorrections.isPending}
                rows={3}
                placeholder="Optional operational note"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicle-correction-reason">Reason for change</Label>
              <Textarea
                id="vehicle-correction-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={updateCorrections.isPending}
                rows={3}
                placeholder="Example: Registration date confirmed with branch admin after late workbook update"
              />
              <p className="text-xs text-muted-foreground">
                Manual corrections are audited. To remove an override, set the field back to the source value and save.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={updateCorrections.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveCorrections()} disabled={updateCorrections.isPending}>
              {updateCorrections.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Corrections
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
