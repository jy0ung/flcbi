import * as XLSX from "xlsx";
import type { DataQualityIssue, VehicleCanonical, VehicleRaw } from "./domain.js";

const xlsxDefault = Reflect.get(XLSX as object, "default") as typeof XLSX | undefined;
const xlsxRuntime = (xlsxDefault ?? XLSX) as typeof XLSX & {
  SSF?: {
    parse_date_code?: (
      value: number,
      options?: { date1904?: boolean },
    ) => { y?: number; m?: number; d?: number } | null;
  };
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .toUpperCase();
}

const HEADER_ALIAS_MAP: Record<string, keyof VehicleRaw> = {
  "CHASSIS NO.": "chassis_no",
  "CHASSIS NO": "chassis_no",
  "BG DATE": "bg_date",
  "SHIPMENT ETD PKG": "shipment_etd_pkg",
  "SHIPMENT ETA KK/TWU/SDK": "shipment_eta_kk_twu_sdk",
  "SHIPMENT ETA": "shipment_eta_kk_twu_sdk",
  "DATE RECEIVED BY OUTLET": "date_received_by_outlet",
  "DELIVERY DATE": "delivery_date",
  "DISB. DATE": "disb_date",
  "DISB DATE": "disb_date",
  BRCH: "branch_code",
  BRANCH: "branch_code",
  MODEL: "model",
  "PAYMENT METHOD": "payment_method",
  "SA NAME": "salesman_name",
  SALESMAN: "salesman_name",
  "SALESMAN NAME": "salesman_name",
  "CUST NAME": "customer_name",
  "CUSTOMER NAME": "customer_name",
  REMARK: "remark",
  REMARKS: "remark",
  "VAA DATE": "vaa_date",
  "FULL PAYMENT DATE": "full_payment_date",
  "REG DATE": "reg_date",
  "NO.": "source_row_no",
  VAR: "variant",
  VARIANT: "variant",
  "DTP (DEALER TRANSFER PRICE)": "dealer_transfer_price",
  "FULL PAYMENT TYPE": "full_payment_type",
  "SHIPMENT NAME": "shipment_name",
  LOU: "lou",
  "CONTRA SOLA": "contra_sola",
  "REG NO": "reg_no",
  "REG NO.": "reg_no",
  "INV NO.": "invoice_no",
  "INV NO": "invoice_no",
  OBR: "obr",
};

const REQUIRED_DB_COLUMNS: (keyof VehicleRaw)[] = [
  "chassis_no",
  "bg_date",
  "shipment_etd_pkg",
  "date_received_by_outlet",
  "reg_date",
  "delivery_date",
  "disb_date",
  "branch_code",
  "model",
  "payment_method",
];

const DATE_FIELDS = new Set<keyof VehicleRaw>([
  "bg_date",
  "shipment_etd_pkg",
  "shipment_eta_kk_twu_sdk",
  "date_received_by_outlet",
  "delivery_date",
  "disb_date",
  "vaa_date",
  "full_payment_date",
  "reg_date",
]);

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function parseTextDate(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;

  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (isValidDateParts(yearNumber, monthNumber, dayNumber)) {
      return formatDateParts(yearNumber, monthNumber, dayNumber);
    }
  }

  const dayFirstMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (isValidDateParts(yearNumber, monthNumber, dayNumber)) {
      return formatDateParts(yearNumber, monthNumber, dayNumber);
    }
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return undefined;
}

function parseExcelDate(value: unknown, date1904: boolean): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    const parsed = xlsxRuntime.SSF?.parse_date_code?.(value, { date1904 });
    if (parsed?.y && parsed.m && parsed.d) {
      return formatDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  if (typeof value === "string") {
    const numericCandidate = Number(value);
    if (Number.isFinite(numericCandidate) && value.trim() !== "") {
      const parsed = xlsxRuntime.SSF?.parse_date_code?.(numericCandidate, { date1904 });
      if (parsed?.y && parsed.m && parsed.d) {
        return formatDateParts(parsed.y, parsed.m, parsed.d);
      }
    }

    return parseTextDate(value);
  }

  return undefined;
}

export interface ParsedWorkbookResult {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
}

export function parseWorkbook(file: ArrayBuffer): ParsedWorkbookResult {
  const workbook = xlsxRuntime.read(file, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((sheet) => sheet.toLowerCase().includes("combine")) ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsxRuntime.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });
  const date1904 = Boolean((workbook as { Workbook?: { WBProps?: { date1904?: boolean } } }).Workbook?.WBProps?.date1904);

  if (jsonData.length === 0) {
    return { rows: [], issues: [], missingColumns: ["No data found"] };
  }

  const rawHeaders = Object.keys(jsonData[0]);
  const columnMapping: Record<string, keyof VehicleRaw> = {};

  rawHeaders.forEach((rawHeader) => {
    const normalized = normalizeHeader(rawHeader);
    if (HEADER_ALIAS_MAP[normalized]) {
      columnMapping[rawHeader] = HEADER_ALIAS_MAP[normalized];
    }
  });

  const mappedDbColumns = new Set(Object.values(columnMapping));
  const missingColumns = REQUIRED_DB_COLUMNS.filter((required) => !mappedDbColumns.has(required));

  const rows: VehicleRaw[] = [];
  const issues: DataQualityIssue[] = [];
  const batchId = `import-${Date.now()}`;

  jsonData.forEach((row, index) => {
    const vehicle: Partial<VehicleRaw> = {
      id: `raw-${index}`,
      import_batch_id: batchId,
      row_number: index + 1,
    };

    Object.entries(columnMapping).forEach(([excelColumn, dbColumn]) => {
      const value = row[excelColumn];
      if (DATE_FIELDS.has(dbColumn)) {
        (vehicle as Record<string, unknown>)[dbColumn] = parseExcelDate(value, date1904);
      } else {
        (vehicle as Record<string, unknown>)[dbColumn] = value ? String(value).trim() : undefined;
      }
    });

    if (!vehicle.chassis_no) {
      issues.push({
        id: `iss-${index}-chassis`,
        chassisNo: "",
        field: "chassis_no",
        issueType: "missing",
        message: `Row ${index + 1}: Missing chassis number`,
        severity: "error",
        importBatchId: batchId,
      });
    }

    vehicle.is_d2d =
      vehicle.remark?.toLowerCase().includes("d2d") ||
      vehicle.remark?.toLowerCase().includes("transfer") ||
      false;

    rows.push(vehicle as VehicleRaw);
  });

  const chassisCount = new Map<string, number>();
  rows.forEach((row) => {
    if (row.chassis_no) {
      chassisCount.set(row.chassis_no, (chassisCount.get(row.chassis_no) ?? 0) + 1);
    }
  });

  chassisCount.forEach((count, chassis) => {
    if (count > 1) {
      issues.push({
        id: `iss-dup-${chassis}`,
        chassisNo: chassis,
        field: "chassis_no",
        issueType: "duplicate",
        message: `Chassis ${chassis} appears ${count} times`,
        severity: "warning",
        importBatchId: batchId,
      });
    }
  });

  return { rows, issues, missingColumns };
}

export function publishCanonical(rows: VehicleRaw[]): { canonical: VehicleCanonical[]; issues: DataQualityIssue[] } {
  const grouped = new Map<string, VehicleRaw[]>();
  rows.filter((row) => row.chassis_no).forEach((row) => {
    const entry = grouped.get(row.chassis_no) ?? [];
    entry.push(row);
    grouped.set(row.chassis_no, entry);
  });

  const canonical: VehicleCanonical[] = [];
  const issues: DataQualityIssue[] = [];

  grouped.forEach((group, chassis) => {
    const best = [...group].sort((left, right) => {
      const countFields = (row: VehicleRaw) => Object.values(row).filter((value) => value !== undefined && value !== "").length;
      return countFields(right) - countFields(left);
    })[0];

    const diff = (from?: string, to?: string): number | null => {
      if (!from || !to) return null;
      return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    };

    const vehicle: VehicleCanonical = {
      id: `canon-${chassis}`,
      chassis_no: chassis,
      bg_date: best.bg_date,
      shipment_etd_pkg: best.shipment_etd_pkg,
      shipment_eta_kk_twu_sdk: best.shipment_eta_kk_twu_sdk,
      date_received_by_outlet: best.date_received_by_outlet,
      reg_date: best.reg_date,
      delivery_date: best.delivery_date,
      disb_date: best.disb_date,
      branch_code: best.branch_code || "Unknown",
      model: best.model || "Unknown",
      payment_method: best.payment_method || "Unknown",
      salesman_name: best.salesman_name || "Unknown",
      customer_name: best.customer_name || "Unknown",
      remark: best.remark,
      vaa_date: best.vaa_date,
      full_payment_date: best.full_payment_date,
      is_d2d: best.is_d2d || false,
      import_batch_id: best.import_batch_id,
      source_row_id: best.id,
      variant: best.variant,
      dealer_transfer_price: best.dealer_transfer_price,
      full_payment_type: best.full_payment_type,
      shipment_name: best.shipment_name,
      lou: best.lou,
      contra_sola: best.contra_sola,
      reg_no: best.reg_no,
      invoice_no: best.invoice_no,
      obr: best.obr,
      bg_to_delivery: diff(best.bg_date, best.delivery_date),
      bg_to_shipment_etd: diff(best.bg_date, best.shipment_etd_pkg),
      etd_to_outlet_received: diff(best.shipment_etd_pkg, best.date_received_by_outlet),
      outlet_received_to_reg: diff(best.date_received_by_outlet, best.reg_date),
      reg_to_delivery: diff(best.reg_date, best.delivery_date),
      etd_to_eta: diff(best.shipment_etd_pkg, best.shipment_eta_kk_twu_sdk),
      eta_to_outlet_received: diff(best.shipment_eta_kk_twu_sdk, best.date_received_by_outlet),
      outlet_received_to_delivery: diff(best.date_received_by_outlet, best.delivery_date),
      bg_to_disb: diff(best.bg_date, best.disb_date),
      delivery_to_disb: diff(best.delivery_date, best.disb_date),
    };

    const kpiFields = [
      ["bg_to_delivery", "BG→Delivery"],
      ["bg_to_shipment_etd", "BG→ETD"],
      ["etd_to_outlet_received", "ETD→Outlet"],
      ["outlet_received_to_reg", "Outlet→Reg"],
      ["reg_to_delivery", "Reg→Delivery"],
      ["bg_to_disb", "BG→Disb"],
      ["delivery_to_disb", "Delivery→Disb"],
    ] as const;

    kpiFields.forEach(([field, label]) => {
      const value = vehicle[field];
      if (value !== null && value !== undefined && value < 0) {
        issues.push({
          id: `neg-${chassis}-${field}`,
          chassisNo: chassis,
          field,
          issueType: "negative",
          message: `${label} is negative (${value} days)`,
          severity: "error",
          importBatchId: best.import_batch_id,
        });
      }
    });

    canonical.push(vehicle);
  });

  return { canonical, issues };
}
