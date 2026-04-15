import type { AppRole, VehicleCanonical } from "./domain.js";

export const VEHICLE_EXPLORER_EDIT_ROLES: readonly AppRole[] = [
  "super_admin",
  "company_admin",
  "director",
  "general_manager",
  "manager",
  "sales",
  "accounts",
  "analyst",
] as const;

export const VEHICLE_CORRECTION_EDITOR_ROLES: readonly AppRole[] = [
  ...VEHICLE_EXPLORER_EDIT_ROLES,
];

export const VEHICLE_CORRECTION_DATE_FIELDS = [
  "bg_date",
  "shipment_etd_pkg",
  "date_received_by_outlet",
  "reg_date",
  "delivery_date",
  "disb_date",
] as const;

export const VEHICLE_CORRECTION_SELECT_FIELDS = [
  "branch_code",
  "payment_method",
] as const;

export const VEHICLE_CORRECTION_TEXT_FIELDS = [
  "salesman_name",
  "customer_name",
  "remark",
] as const;

export const VEHICLE_CORRECTION_FIELDS = [
  ...VEHICLE_CORRECTION_DATE_FIELDS,
  ...VEHICLE_CORRECTION_SELECT_FIELDS,
  ...VEHICLE_CORRECTION_TEXT_FIELDS,
] as const;

export type VehicleCorrectionField = typeof VEHICLE_CORRECTION_FIELDS[number];

export const VEHICLE_CORRECTION_FIELD_LABELS: Record<VehicleCorrectionField, string> = {
  bg_date: "BG Date",
  shipment_etd_pkg: "Shipment ETD",
  date_received_by_outlet: "Outlet Received",
  reg_date: "Registration Date",
  delivery_date: "Delivery Date",
  disb_date: "Disbursement Date",
  branch_code: "Branch",
  payment_method: "Payment Method",
  salesman_name: "Salesman",
  customer_name: "Customer",
  remark: "Remark",
};

export interface VehicleCorrection {
  id: string;
  chassisNo: string;
  field: VehicleCorrectionField;
  value: string | null;
  reason: string;
  updatedAt: string;
  createdAt: string;
  updatedBy?: string | null;
  updatedByName?: string | null;
}

type VehicleCorrectionLike = Pick<VehicleCorrection, "field" | "value">;

function diff(from?: string, to?: string) {
  if (!from || !to) {
    return null;
  }

  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

export function recalculateVehicleDerivedFields(vehicle: VehicleCanonical): VehicleCanonical {
  return {
    ...vehicle,
    bg_to_delivery: diff(vehicle.bg_date, vehicle.delivery_date),
    bg_to_shipment_etd: diff(vehicle.bg_date, vehicle.shipment_etd_pkg),
    etd_to_outlet_received: diff(vehicle.shipment_etd_pkg, vehicle.date_received_by_outlet),
    outlet_received_to_reg: diff(vehicle.date_received_by_outlet, vehicle.reg_date),
    reg_to_delivery: diff(vehicle.reg_date, vehicle.delivery_date),
    etd_to_eta: diff(vehicle.shipment_etd_pkg, vehicle.shipment_eta_kk_twu_sdk),
    eta_to_outlet_received: diff(vehicle.shipment_eta_kk_twu_sdk, vehicle.date_received_by_outlet),
    outlet_received_to_delivery: diff(vehicle.date_received_by_outlet, vehicle.delivery_date),
    bg_to_disb: diff(vehicle.bg_date, vehicle.disb_date),
    delivery_to_disb: diff(vehicle.delivery_date, vehicle.disb_date),
  };
}

export function applyVehicleCorrections(
  vehicle: VehicleCanonical,
  corrections: VehicleCorrectionLike[],
): VehicleCanonical {
  const next: VehicleCanonical = { ...vehicle };
  const mutableNext = next as unknown as Record<string, string | undefined>;

  for (const correction of corrections) {
    switch (correction.field) {
      case "bg_date":
      case "shipment_etd_pkg":
      case "date_received_by_outlet":
      case "reg_date":
      case "delivery_date":
      case "disb_date":
      case "branch_code":
      case "remark":
        mutableNext[correction.field] = correction.value ?? undefined;
        break;
      case "payment_method":
      case "salesman_name":
      case "customer_name":
        if (correction.value != null) {
          mutableNext[correction.field] = correction.value;
        }
        break;
      default: {
        const exhaustiveCheck: never = correction.field;
        return exhaustiveCheck;
      }
    }
  }

  return recalculateVehicleDerivedFields(next);
}
