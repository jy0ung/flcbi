import ExcelJS from "exceljs";
import type { DataQualityIssue, VehicleCanonical, VehicleRaw } from "./domain.js";

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_ROWS = 50_000;

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

function excelSerialToDateParts(serial: number, date1904: boolean): string | undefined {
  if (!Number.isFinite(serial)) {
    return undefined;
  }

  const wholeDays = Math.trunc(serial);
  const fraction = serial - wholeDays;
  const adjustedDays = date1904 ? wholeDays : wholeDays >= 60 ? wholeDays - 1 : wholeDays;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const timestamp = epoch + adjustedDays * 86400000 + Math.round(fraction * 86400000);
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
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
    const parsed = excelSerialToDateParts(value, date1904);
    if (parsed) {
      return parsed;
    }
  }

  if (typeof value === "string") {
    const numericCandidate = Number(value);
    if (Number.isFinite(numericCandidate) && value.trim() !== "") {
      const parsed = excelSerialToDateParts(numericCandidate, date1904);
      if (parsed) {
        return parsed;
      }
    }

    return parseTextDate(value);
  }

  return undefined;
}

function normalizeWorkbookCellValue(
  value: unknown,
  options: { date1904: boolean; header?: keyof VehicleRaw },
): string | number | boolean | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if ("formula" in record) {
      return normalizeWorkbookCellValue(record.result ?? record.formula, options);
    }

    if ("richText" in record && Array.isArray(record.richText)) {
      return record.richText
        .map((part) => String((part as { text?: unknown }).text ?? ""))
        .join("");
    }

    if ("text" in record && typeof record.text === "string") {
      return record.text;
    }

    if ("hyperlink" in record && typeof record.text === "string") {
      return record.text;
    }

    if ("result" in record) {
      return normalizeWorkbookCellValue(record.result, options);
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }

    if (options.header && DATE_FIELDS.has(options.header)) {
      const parsed = parseExcelDate(trimmed, options.date1904);
      if (parsed) {
        return parsed;
      }
    }

    return trimmed;
  }

  if (typeof value === "number") {
    if (options.header && DATE_FIELDS.has(options.header)) {
      return parseExcelDate(value, options.date1904);
    }
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).trim() || undefined;
}

export interface ParsedWorkbookResult {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
}

export interface ParsedWorkbookSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  status: "validated" | "failed";
}

export function summarizeParsedWorkbook(parsed: ParsedWorkbookResult): ParsedWorkbookSummary {
  const errorRows = parsed.issues.filter((issue) => issue.severity === "error").length;
  return {
    totalRows: parsed.rows.length,
    validRows: parsed.rows.length - errorRows,
    errorRows,
    duplicateRows: parsed.issues.filter((issue) => issue.issueType === "duplicate").length,
    status: parsed.missingColumns.length > 0 ? "failed" : "validated",
  };
}

export async function parseWorkbook(file: ArrayBuffer): Promise<ParsedWorkbookResult> {
  if (file.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Workbook exceeds the ${Math.floor(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB import size limit`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(file));

  const sheetName = workbook.worksheets.find((sheet) => sheet.name.toLowerCase().includes("combine"))?.name
    ?? workbook.worksheets[0]?.name;
  if (!sheetName) {
    return { rows: [], issues: [], missingColumns: ["No worksheets found"] };
  }

  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    return { rows: [], issues: [], missingColumns: ["No worksheets found"] };
  }

  const date1904 = Boolean(workbook.properties?.date1904);
  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(worksheet.actualColumnCount ?? 0, headerRow.actualCellCount ?? 0);

  if (columnCount === 0 || worksheet.actualRowCount <= 1) {
    return { rows: [], issues: [], missingColumns: ["No data found"] };
  }

  const columnDefinitions = Array.from({ length: columnCount }, (_unused, index) => {
    const rawHeader = String(headerRow.getCell(index + 1).value ?? "")
      .trim()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ") || `Column ${index + 1}`;

    return {
      rawHeader,
      dbColumn: HEADER_ALIAS_MAP[normalizeHeader(rawHeader)],
    } as const;
  });

  const mappedDbColumns = new Set(columnDefinitions.flatMap((definition) => (definition.dbColumn ? [definition.dbColumn] : [])));
  const missingColumns = REQUIRED_DB_COLUMNS.filter((required) => !mappedDbColumns.has(required));

  const rows: VehicleRaw[] = [];
  const issues: DataQualityIssue[] = [];
  const batchId = `import-${Date.now()}`;

  const dataRowCount = Math.max(worksheet.actualRowCount - 1, 0);
  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new Error(`Workbook exceeds the ${MAX_IMPORT_ROWS.toLocaleString("en-US")} row import limit`);
  }

  for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (!row.hasValues) {
      continue;
    }

    const vehicle: Partial<VehicleRaw> = {
      id: `raw-${rowIndex - 1}`,
      import_batch_id: batchId,
      row_number: rowIndex - 1,
      source_headers: columnDefinitions.map((definition) => definition.rawHeader),
    };
    const sourceValues: Record<string, string | number | boolean | null> = {};

    columnDefinitions.forEach((definition, columnIndex) => {
      const cellValue = row.getCell(columnIndex + 1).value;

      if (definition.dbColumn) {
        const normalized = normalizeWorkbookCellValue(cellValue, { date1904, header: definition.dbColumn });
        if (DATE_FIELDS.has(definition.dbColumn)) {
          (vehicle as Record<string, unknown>)[definition.dbColumn] = normalized === undefined ? undefined : String(normalized).trim();
        } else {
          const textValue = normalized === undefined ? undefined : String(normalized).trim();
          (vehicle as Record<string, unknown>)[definition.dbColumn] = textValue === "" ? undefined : textValue;
        }
      } else {
        const normalized = normalizeWorkbookCellValue(cellValue, { date1904 });
        if (normalized !== undefined) {
          sourceValues[definition.rawHeader] = normalized;
        }
      }
    });

    if (Object.keys(sourceValues).length > 0) {
      vehicle.source_values = sourceValues;
    }

    if (!vehicle.chassis_no) {
      issues.push({
        id: `iss-${rowIndex - 1}-chassis`,
        chassisNo: "",
        field: "chassis_no",
        issueType: "missing",
        message: `Row ${rowIndex - 1}: Missing chassis number`,
        severity: "error",
        importBatchId: batchId,
      });
    }

    vehicle.is_d2d =
      vehicle.remark?.toLowerCase().includes("d2d") ||
      vehicle.remark?.toLowerCase().includes("transfer") ||
      false;

    rows.push(vehicle as VehicleRaw);
  }

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
  const ignoredCountFields = new Set<keyof VehicleRaw>(["source_headers", "source_values"]);

  grouped.forEach((group, chassis) => {
    const best = [...group].sort((left, right) => {
      const countFields = (row: VehicleRaw) =>
        Object.entries(row).filter(
          ([key, value]) => !ignoredCountFields.has(key as keyof VehicleRaw) && value !== undefined && value !== "",
        ).length;
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
