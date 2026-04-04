import { describe, expect, it } from "vitest";
import { buildAgingSummary, buildStockSnapshot, createDefaultSlaPolicies, queryVehicles } from "./analytics.js";
import type { DataQualityIssue, ImportBatch, VehicleCanonical } from "./domain.js";

const vehicles: VehicleCanonical[] = [
  {
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
    bg_to_delivery: 32,
    bg_to_shipment_etd: 10,
    etd_to_eta: 8,
    eta_to_outlet_received: 4,
    outlet_received_to_delivery: 10,
    bg_to_disb: 40,
    delivery_to_disb: 8,
    bg_date: "2026-01-04",
    shipment_etd_pkg: "2026-01-14",
    shipment_eta_kk_twu_sdk: "2026-01-22",
    date_received_by_outlet: "2026-01-26",
    delivery_date: "2026-02-05",
    disb_date: "2026-02-13",
  },
  {
    id: "vehicle-2",
    chassis_no: "PMK987654B",
    branch_code: "MYY",
    model: "MYVI",
    payment_method: "Cash",
    salesman_name: "Ben",
    customer_name: "Beta Ventures",
    is_d2d: true,
    import_batch_id: "import-1",
    source_row_id: "row-2",
    bg_to_delivery: 51,
    bg_to_shipment_etd: 16,
    etd_to_eta: 18,
    eta_to_outlet_received: 5,
    outlet_received_to_delivery: 12,
    bg_to_disb: 57,
    delivery_to_disb: 6,
    bg_date: "2026-01-09",
    shipment_etd_pkg: "2026-01-25",
    shipment_eta_kk_twu_sdk: "2026-02-12",
    date_received_by_outlet: "2026-02-17",
    delivery_date: "2026-03-01",
    disb_date: "2026-03-07",
  },
];

const issues: DataQualityIssue[] = [
  {
    id: "issue-1",
    chassisNo: vehicles[1].chassis_no,
    field: "delivery_date",
    issueType: "missing",
    message: "Delivery date is missing",
    severity: "warning",
    importBatchId: "import-1",
  },
];

const imports: ImportBatch[] = [
  {
    id: "import-1",
    fileName: "aging.xlsx",
    uploadedBy: "Operations Admin",
    uploadedAt: "2026-02-03T10:00:00.000Z",
    status: "published",
    totalRows: 2,
    validRows: 2,
    errorRows: 0,
    duplicateRows: 0,
    publishedAt: "2026-02-03T10:02:00.000Z",
  },
];

describe("queryVehicles", () => {
  it("filters by branch and paginates", () => {
    const result = queryVehicles(vehicles, {
      search: "",
      branch: "KK",
      model: "all",
      payment: "all",
      page: 1,
      pageSize: 25,
      sortField: "bg_to_delivery",
      sortDirection: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.branch_code).toBe("KK");
    expect(result.filterOptions.branches).toEqual(["KK", "MYY"]);
  });
});

describe("buildAgingSummary", () => {
  it("computes KPI and import totals from live-style fixtures", () => {
    const summary = buildAgingSummary(
      vehicles,
      createDefaultSlaPolicies("company-1"),
      issues,
      imports,
      "2026-02-03T10:02:00.000Z",
    );

    expect(summary.totalVehicles).toBe(2);
    expect(summary.importCount).toBe(1);
    expect(summary.totalIssues).toBe(1);
    expect(summary.kpiSummaries).toHaveLength(7);
    expect(summary.stockSnapshot.disbursed).toBe(2);
    expect(summary.latestImport?.id).toBe("import-1");
    expect(summary.slowestVehicles[0]?.chassis_no).toBe("PMK987654B");
  });

  it("builds stock snapshot stages for open units", () => {
    const stockVehicles: VehicleCanonical[] = [
      {
        ...vehicles[0],
        id: "vehicle-open-1",
        chassis_no: "OPEN-1",
        shipment_etd_pkg: undefined,
        shipment_eta_kk_twu_sdk: undefined,
        date_received_by_outlet: undefined,
        delivery_date: undefined,
        disb_date: undefined,
        bg_date: "2026-01-01",
      },
      {
        ...vehicles[0],
        id: "vehicle-open-2",
        chassis_no: "OPEN-2",
        shipment_etd_pkg: "2026-01-05",
        shipment_eta_kk_twu_sdk: "2026-01-10",
        date_received_by_outlet: undefined,
        delivery_date: undefined,
        disb_date: undefined,
        bg_date: "2026-01-02",
      },
      {
        ...vehicles[0],
        id: "vehicle-open-3",
        chassis_no: "OPEN-3",
        shipment_etd_pkg: "2026-01-05",
        shipment_eta_kk_twu_sdk: "2026-01-10",
        date_received_by_outlet: "2026-01-12",
        delivery_date: undefined,
        disb_date: undefined,
        bg_date: "2026-01-03",
        is_d2d: true,
      },
      {
        ...vehicles[0],
        id: "vehicle-open-4",
        chassis_no: "OPEN-4",
        delivery_date: "2026-02-10",
        disb_date: undefined,
      },
    ];

    const snapshot = buildStockSnapshot(stockVehicles, "2026-04-15");

    expect(snapshot.openStock).toBe(3);
    expect(snapshot.pendingShipment).toBe(1);
    expect(snapshot.inTransit).toBe(1);
    expect(snapshot.atOutlet).toBe(1);
    expect(snapshot.deliveredPendingDisbursement).toBe(1);
    expect(snapshot.d2dOpenTransfers).toBe(1);
    expect(snapshot.aged90Plus).toBe(3);
  });
});
