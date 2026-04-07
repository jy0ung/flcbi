import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyVehicleCorrections,
  type VehicleCanonical,
  type VehicleCorrection,
  type VehicleCorrectionField,
} from "@flcbi/contracts";

interface VehicleRow {
  id: string;
  branch_id: string | null;
  branch_code: string | null;
  import_job_id: string;
  source_row_id: string | null;
  chassis_no: string;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
  model: string | null;
  payment_method: string | null;
  salesman_name: string | null;
  customer_name: string | null;
  is_d2d: boolean;
  bg_to_delivery: number | null;
  bg_to_shipment_etd: number | null;
  etd_to_outlet_received: number | null;
  outlet_received_to_reg: number | null;
  reg_to_delivery: number | null;
  etd_to_eta: number | null;
  eta_to_outlet_received: number | null;
  outlet_received_to_delivery: number | null;
  bg_to_disb: number | null;
  delivery_to_disb: number | null;
}

interface VehicleCorrectionRow {
  chassis_no: string;
  field_name: VehicleCorrectionField;
  value_text: string | null;
}

export interface WorkerProfileRow {
  id: string;
  display_name: string;
  app_role: string;
  primary_branch_id: string | null;
}

export interface VisibleVehicle {
  branchId: string | null;
  vehicle: VehicleCanonical;
}

export async function fetchProfiles(client: SupabaseClient, userIds: string[]) {
  const map = new Map<string, WorkerProfileRow>();
  if (userIds.length === 0) {
    return map;
  }

  const { data } = await client
    .schema("app")
    .from("user_profiles")
    .select("id, display_name, app_role, primary_branch_id")
    .in("id", userIds)
    .throwOnError();

  for (const row of (data ?? []) as WorkerProfileRow[]) {
    map.set(row.id, row);
  }

  return map;
}

export async function fetchVehicles(client: SupabaseClient, companyId: string) {
  const { data } = await client
    .schema("mart")
    .from("vehicle_aging")
    .select("id, branch_id, branch_code, import_job_id, source_row_id, chassis_no, bg_date, shipment_etd_pkg, shipment_eta, date_received_by_outlet, reg_date, delivery_date, disb_date, model, payment_method, salesman_name, customer_name, is_d2d, bg_to_delivery, bg_to_shipment_etd, etd_to_outlet_received, outlet_received_to_reg, reg_to_delivery, etd_to_eta, eta_to_outlet_received, outlet_received_to_delivery, bg_to_disb, delivery_to_disb")
    .eq("company_id", companyId)
    .order("bg_date", { ascending: false })
    .throwOnError();

  const rows = (data ?? []) as VehicleRow[];
  const correctionsByChassis = await fetchVehicleCorrections(client, companyId, rows.map((row) => row.chassis_no));

  return rows.map((row) => ({
    branchId: row.branch_id,
    vehicle: applyVehicleCorrections(mapVehicleRow(row), correctionsByChassis.get(row.chassis_no) ?? []),
  }));
}

export function filterVehiclesForProfile(vehicles: VisibleVehicle[], profile: WorkerProfileRow) {
  if (profile.primary_branch_id && ["manager", "sales", "accounts"].includes(profile.app_role)) {
    return vehicles.filter((vehicle) => vehicle.branchId === profile.primary_branch_id);
  }

  return vehicles;
}

function mapVehicleRow(row: VehicleRow): VehicleCanonical {
  return {
    id: row.id,
    chassis_no: row.chassis_no,
    bg_date: row.bg_date ?? undefined,
    shipment_etd_pkg: row.shipment_etd_pkg ?? undefined,
    shipment_eta_kk_twu_sdk: row.shipment_eta ?? undefined,
    date_received_by_outlet: row.date_received_by_outlet ?? undefined,
    reg_date: row.reg_date ?? undefined,
    delivery_date: row.delivery_date ?? undefined,
    disb_date: row.disb_date ?? undefined,
    branch_code: row.branch_code ?? "UNKNOWN",
    model: row.model ?? "Unknown",
    payment_method: row.payment_method ?? "Unknown",
    salesman_name: row.salesman_name ?? "Unknown",
    customer_name: row.customer_name ?? "Unknown",
    is_d2d: row.is_d2d,
    import_batch_id: row.import_job_id,
    source_row_id: row.source_row_id ?? row.id,
    bg_to_delivery: row.bg_to_delivery,
    bg_to_shipment_etd: row.bg_to_shipment_etd,
    etd_to_outlet_received: row.etd_to_outlet_received,
    outlet_received_to_reg: row.outlet_received_to_reg,
    reg_to_delivery: row.reg_to_delivery,
    etd_to_eta: row.etd_to_eta,
    eta_to_outlet_received: row.eta_to_outlet_received,
    outlet_received_to_delivery: row.outlet_received_to_delivery,
    bg_to_disb: row.bg_to_disb,
    delivery_to_disb: row.delivery_to_disb,
  };
}

async function fetchVehicleCorrections(client: SupabaseClient, companyId: string, chassisNos: string[]) {
  const correctionsByChassis = new Map<string, VehicleCorrection[]>();
  if (chassisNos.length === 0) {
    return correctionsByChassis;
  }

  const uniqueChassisNos = [...new Set(chassisNos)];
  let query = client
    .schema("app")
    .from("vehicle_record_corrections")
    .select("chassis_no, field_name, value_text")
    .eq("company_id", companyId);
  if (uniqueChassisNos.length <= 100) {
    query = query.in("chassis_no", uniqueChassisNos);
  }

  const { data } = await query.throwOnError();

  for (const row of (data ?? []) as VehicleCorrectionRow[]) {
    const items = correctionsByChassis.get(row.chassis_no) ?? [];
    items.push({
      id: `${row.chassis_no}:${row.field_name}`,
      chassisNo: row.chassis_no,
      field: row.field_name,
      value: row.value_text,
      reason: "",
      createdAt: "",
      updatedAt: "",
    });
    correctionsByChassis.set(row.chassis_no, items);
  }

  return correctionsByChassis;
}
