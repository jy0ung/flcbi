import type {
  UpdateVehicleCorrectionsRequest,
  VehicleCanonical,
  VehicleCorrectionField,
} from "@flcbi/contracts";

export const VEHICLE_CORRECTION_DATE_FIELDS = [
  "bg_date",
  "shipment_etd_pkg",
  "date_received_by_outlet",
  "reg_date",
  "delivery_date",
  "disb_date",
] as const satisfies readonly VehicleCorrectionField[];

export const VEHICLE_CORRECTION_SELECT_FIELDS = [
  "branch_code",
  "payment_method",
] as const satisfies readonly VehicleCorrectionField[];

export const VEHICLE_CORRECTION_TEXT_FIELDS = [
  "salesman_name",
  "customer_name",
  "remark",
] as const satisfies readonly VehicleCorrectionField[];

export const VEHICLE_CORRECTION_EDIT_FIELDS = [
  ...VEHICLE_CORRECTION_DATE_FIELDS,
  ...VEHICLE_CORRECTION_SELECT_FIELDS,
  ...VEHICLE_CORRECTION_TEXT_FIELDS,
] as const;

export type EditableVehicleField = typeof VEHICLE_CORRECTION_EDIT_FIELDS[number];

export type VehicleCorrectionDraft = Omit<UpdateVehicleCorrectionsRequest, "reason">;

export function buildVehicleCorrectionDraft(vehicle?: VehicleCanonical): VehicleCorrectionDraft {
  return {
    bg_date: vehicle?.bg_date ?? "",
    shipment_etd_pkg: vehicle?.shipment_etd_pkg ?? "",
    date_received_by_outlet: vehicle?.date_received_by_outlet ?? "",
    reg_date: vehicle?.reg_date ?? "",
    delivery_date: vehicle?.delivery_date ?? "",
    disb_date: vehicle?.disb_date ?? "",
    branch_code: vehicle?.branch_code ?? "",
    payment_method: vehicle?.payment_method ?? "",
    salesman_name: vehicle?.salesman_name ?? "",
    customer_name: vehicle?.customer_name ?? "",
    remark: vehicle?.remark ?? "",
  };
}

export function getVehicleFieldValue(vehicle: VehicleCanonical, field: EditableVehicleField) {
  return (vehicle[field] as string | undefined) ?? "";
}

export function normalizeVehicleCorrectionDraftValue(field: EditableVehicleField, value: string) {
  const normalized = value.trim();

  if (field === "remark") {
    return normalized;
  }

  return normalized;
}

export function buildVehicleCorrectionUpdate(
  vehicle: VehicleCanonical,
  draft: VehicleCorrectionDraft,
  reason: string,
) {
  const input: UpdateVehicleCorrectionsRequest = { reason: reason.trim() };
  let changedCount = 0;

  for (const field of VEHICLE_CORRECTION_EDIT_FIELDS) {
    const nextValue = normalizeVehicleCorrectionDraftValue(field, draft[field] ?? "");
    const currentValue = normalizeVehicleCorrectionDraftValue(field, getVehicleFieldValue(vehicle, field));
    if (nextValue === currentValue) {
      continue;
    }

    input[field] = nextValue;
    changedCount += 1;
  }

  return {
    input,
    changedCount,
  };
}
