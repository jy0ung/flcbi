import { describe, expect, it } from "vitest";
import {
  applyVehicleCorrections,
  buildVehicleCorrectionAuditEvent,
  canManageVehicleCorrections,
} from "./vehicle-corrections.js";
import type { AppRole, VehicleCanonical } from "./domain.js";

const baseVehicle: VehicleCanonical = {
  id: "vehicle-1",
  chassis_no: "PMK123456A",
  branch_code: "KK",
  model: "ATIVA",
  payment_method: "Loan",
  salesman_name: "Alicia",
  customer_name: "Alpha Holdings",
  is_d2d: false,
  import_batch_id: "import-1",
  source_row_id: "row-1",
  bg_date: "2026-01-04",
  shipment_etd_pkg: "2026-01-14",
  date_received_by_outlet: "2026-01-26",
  reg_date: "2026-01-30",
  delivery_date: "2026-02-05",
  disb_date: "2026-02-13",
  bg_to_delivery: 32,
  bg_to_shipment_etd: 10,
  etd_to_outlet_received: 12,
  outlet_received_to_reg: 4,
  reg_to_delivery: 6,
  etd_to_eta: null,
  eta_to_outlet_received: null,
  outlet_received_to_delivery: 10,
  bg_to_disb: 40,
  delivery_to_disb: 8,
};

describe("applyVehicleCorrections", () => {
  it("applies date overrides and recomputes KPI fields", () => {
    const corrected = applyVehicleCorrections(baseVehicle, [
      { field: "delivery_date", value: "2026-02-10" },
      { field: "disb_date", value: "2026-02-18" },
    ]);

    expect(corrected.delivery_date).toBe("2026-02-10");
    expect(corrected.disb_date).toBe("2026-02-18");
    expect(corrected.bg_to_delivery).toBe(37);
    expect(corrected.reg_to_delivery).toBe(11);
    expect(corrected.bg_to_disb).toBe(45);
    expect(corrected.delivery_to_disb).toBe(8);
  });

  it("applies text overrides without dropping required base fields", () => {
    const corrected = applyVehicleCorrections(baseVehicle, [
      { field: "payment_method", value: "Cash" },
      { field: "salesman_name", value: "Benedict" },
      { field: "remark", value: "Customer requested urgent release" },
    ]);

    expect(corrected.payment_method).toBe("Cash");
    expect(corrected.salesman_name).toBe("Benedict");
    expect(corrected.customer_name).toBe("Alpha Holdings");
    expect(corrected.remark).toBe("Customer requested urgent release");
  });

  it("supports clearing nullable fields", () => {
    const corrected = applyVehicleCorrections(
      { ...baseVehicle, remark: "Legacy note" },
      [
        { field: "remark", value: null },
        { field: "reg_date", value: null },
      ],
    );

    expect(corrected.remark).toBeUndefined();
    expect(corrected.reg_date).toBeUndefined();
    expect(corrected.outlet_received_to_reg).toBeNull();
    expect(corrected.reg_to_delivery).toBeNull();
  });
});

describe("vehicle correction policy", () => {
  it("limits editor access to aging write roles", () => {
    const editableRoles: AppRole[] = [
      "super_admin",
      "company_admin",
      "director",
      "general_manager",
      "manager",
    ];
    const readOnlyRoles: AppRole[] = [
      "sales",
      "accounts",
      "analyst",
    ];

    for (const role of editableRoles) {
      expect(canManageVehicleCorrections(role)).toBe(true);
    }

    for (const role of readOnlyRoles) {
      expect(canManageVehicleCorrections(role)).toBe(false);
    }
  });

  it("builds a consistent audit event payload", () => {
    expect(buildVehicleCorrectionAuditEvent({
      chassisNo: "PMK123456A",
      fields: ["branch_code", "payment_method"],
      reason: "  Correct mapped outlet and payment  ",
      userId: "user-1",
      userName: "Ops Manager",
    })).toEqual({
      action: "vehicle_corrections_updated",
      entity: "vehicle_record_correction",
      entityId: "PMK123456A",
      userId: "user-1",
      userName: "Ops Manager",
      details: "Updated Branch, Payment Method for PMK123456A. Reason: Correct mapped outlet and payment",
    });
  });
});
