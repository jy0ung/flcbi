import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import {
  applyApprovedExplorerMappings,
  buildVehicleNegativeQualityIssues,
  parseWorkbook,
  publishCanonical,
} from "./imports.js";

function createWorkbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Combine Data");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

describe("parseWorkbook", () => {
  it("parses Excel serial dates without relying on XLSX.SSF namespace exports", async () => {
    const workbook = createWorkbookBuffer([
      [
        "CHASSIS NO.",
        "BG DATE",
        "SHIPMENT ETD PKG",
        "DATE RECEIVED BY OUTLET",
        "REG DATE",
        "DELIVERY DATE",
        "DISB. DATE",
        "BRCH",
        "MODEL",
        "PAYMENT METHOD",
        "REMARKS",
      ],
      ["PMK123456A", 45748, 45755, 45768, 45770, 45774, 45782, "KK", "ATIVA", "Loan", "D2D transfer"],
      ["PMK123456A", 45748, 45755, 45768, 45770, 45774, 45782, "KK", "ATIVA", "Loan", ""],
    ]);

    const parsed = await parseWorkbook(workbook);

    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.bg_date).toBe("2025-04-01");
    expect(parsed.rows[0]?.reg_date).toBe("2025-04-23");
    expect(parsed.rows[0]?.is_d2d).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueType: "duplicate",
          chassisNo: "PMK123456A",
          severity: "warning",
        }),
      ]),
    );
  });

  it("accepts day-first text dates and reports missing chassis rows", async () => {
    const workbook = createWorkbookBuffer([
      [
        "CHASSIS NO.",
        "BG DATE",
        "SHIPMENT ETD PKG",
        "DATE RECEIVED BY OUTLET",
        "REG DATE",
        "DELIVERY DATE",
        "DISB. DATE",
        "BRANCH",
        "MODEL",
        "PAYMENT METHOD",
      ],
      ["", "01/04/2025", "05/04/2025", "17/04/2025", "18/04/2025", "20/04/2025", "25/04/2025", "MYY", "MYVI", "Cash"],
    ]);

    const parsed = await parseWorkbook(workbook);

    expect(parsed.rows[0]?.bg_date).toBe("2025-04-01");
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "chassis_no",
          issueType: "missing",
          severity: "error",
        }),
      ]),
    );
  });
});

describe("publishCanonical", () => {
  it("flags negative KPI durations as errors", () => {
    const { issues } = publishCanonical([
      {
        id: "row-1",
        import_batch_id: "import-1",
        row_number: 1,
        chassis_no: "PMKNEGATIVE1",
        branch_code: "KK",
        model: "ATIVA",
        payment_method: "Loan",
        salesman_name: "Alice",
        customer_name: "Alpha",
        bg_date: "2025-04-10",
        delivery_date: "2025-04-05",
      },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chassisNo: "PMKNEGATIVE1",
          issueType: "negative",
          severity: "error",
        }),
      ]),
    );
  });
});

describe("applyApprovedExplorerMappings", () => {
  it("normalizes branch and payment values using approved mappings only", () => {
    const [row] = applyApprovedExplorerMappings([
      {
        id: "row-1",
        import_batch_id: "import-1",
        row_number: 1,
        chassis_no: "PMK123456A",
        branch_code: "flagship",
        payment_method: "loan hire",
      },
    ], {
      branches: [
        { rawValue: "flagship", normalizedValue: "KK", approved: true },
        { rawValue: "other", normalizedValue: "MYY", approved: false },
      ],
      payments: [
        { rawValue: "loan hire", normalizedValue: "Loan", approved: true },
      ],
    });

    expect(row?.branch_code).toBe("KK");
    expect(row?.payment_method).toBe("Loan");
  });
});

describe("buildVehicleNegativeQualityIssues", () => {
  it("creates correction-friendly negative KPI issues from one vehicle", () => {
    const issues = buildVehicleNegativeQualityIssues({
      id: "vehicle-1",
      chassis_no: "PMKNEG2",
      branch_code: "KK",
      model: "ATIVA",
      payment_method: "Loan",
      salesman_name: "Alice",
      customer_name: "Alpha",
      is_d2d: false,
      import_batch_id: "import-1",
      source_row_id: "row-1",
      bg_date: "2025-04-10",
      delivery_date: "2025-04-05",
      bg_to_delivery: -5,
      bg_to_shipment_etd: null,
      etd_to_outlet_received: null,
      outlet_received_to_reg: null,
      reg_to_delivery: null,
      etd_to_eta: null,
      eta_to_outlet_received: null,
      outlet_received_to_delivery: null,
      bg_to_disb: null,
      delivery_to_disb: null,
    });

    expect(issues).toEqual([
      expect.objectContaining({
        chassisNo: "PMKNEG2",
        field: "bg_to_delivery",
        issueType: "negative",
        severity: "error",
      }),
    ]);
  });
});
