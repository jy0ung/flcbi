import * as XLSX from 'xlsx';
import { VehicleRaw, DataQualityIssue, VehicleCanonical } from '@/types';

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .toUpperCase();
}

const HEADER_ALIAS_MAP: Record<string, keyof VehicleRaw> = {
  'CHASSIS NO.': 'chassis_no',
  'CHASSIS NO': 'chassis_no',
  'BG DATE': 'bg_date',
  'SHIPMENT ETD PKG': 'shipment_etd_pkg',
  'SHIPMENT ETA KK/TWU/SDK': 'shipment_eta_kk_twu_sdk',
  'SHIPMENT ETA': 'shipment_eta_kk_twu_sdk',
  'DATE RECEIVED BY OUTLET': 'date_received_by_outlet',
  'REG DATE': 'reg_date',
  'DELIVERY DATE': 'delivery_date',
  'DISB. DATE': 'disb_date',
  'DISB DATE': 'disb_date',
  'BRCH': 'branch_code',
  'BRANCH': 'branch_code',
  'MODEL': 'model',
  'PAYMENT METHOD': 'payment_method',
  'SA NAME': 'salesman_name',
  'SALESMAN': 'salesman_name',
  'SALESMAN NAME': 'salesman_name',
  'CUST NAME': 'customer_name',
  'CUSTOMER NAME': 'customer_name',
  'REMARK': 'remark',
  'REMARKS': 'remark',
  'VAA DATE': 'vaa_date',
  'FULL PAYMENT DATE': 'full_payment_date',
  // Optional columns
  'NO.': 'source_row_no',
  'VAR': 'variant',
  'VARIANT': 'variant',
  'DTP (DEALER TRANSFER PRICE)': 'dealer_transfer_price',
  'FULL PAYMENT TYPE': 'full_payment_type',
  'SHIPMENT NAME': 'shipment_name',
  'LOU': 'lou',
  'CONTRA SOLA': 'contra_sola',
  'REG NO': 'reg_no',
  'REG NO.': 'reg_no',
  'INV NO.': 'invoice_no',
  'INV NO': 'invoice_no',
  'OBR': 'obr',
};

const REQUIRED_DB_COLUMNS: (keyof VehicleRaw)[] = [
  'chassis_no',
  'bg_date',
  'shipment_etd_pkg',
  'date_received_by_outlet',
  'reg_date',
  'delivery_date',
  'disb_date',
  'branch_code',
  'model',
  'payment_method',
];

const DATE_FIELDS = new Set<keyof VehicleRaw>([
  'bg_date', 'shipment_etd_pkg', 'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet', 'delivery_date', 'disb_date',
  'vaa_date', 'full_payment_date', 'reg_date',
]);

function parseExcelDate(val: unknown): string | undefined {
  if (!val) return undefined;
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    // dd.mm.yyyy or dd.mm.yy (dot-separated)
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      const day = dotMatch[1].padStart(2, '0');
      const month = dotMatch[2].padStart(2, '0');
      let year = dotMatch[3];
      if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
      return `${year}-${month}-${day}`;
    }
    // dd/mm/yyyy or dd/mm/yy (slash-separated)
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      const day = slashMatch[1].padStart(2, '0');
      const month = slashMatch[2].padStart(2, '0');
      let year = slashMatch[3];
      if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
      return `${year}-${month}-${day}`;
    }
    // ISO or other parseable format
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  // Date object (xlsx cellDates mode or openpyxl-style)
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  return undefined;
}

export function parseWorkbook(file: ArrayBuffer): { rows: VehicleRaw[]; issues: DataQualityIssue[]; missingColumns: string[] } {
  const wb = XLSX.read(file, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('combine')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (jsonData.length === 0) return { rows: [], issues: [], missingColumns: ['No data found'] };

  const rawHeaders = Object.keys(jsonData[0]);
  const columnMapping: Record<string, keyof VehicleRaw> = {};

  rawHeaders.forEach(rawHeader => {
    const normalized = normalizeHeader(rawHeader);
    if (HEADER_ALIAS_MAP[normalized]) {
      columnMapping[rawHeader] = HEADER_ALIAS_MAP[normalized];
    }
  });

  const mappedDbColumns = new Set(Object.values(columnMapping));
  const missingColumns = REQUIRED_DB_COLUMNS.filter(rc => !mappedDbColumns.has(rc));

  const rows: VehicleRaw[] = [];
  const issues: DataQualityIssue[] = [];
  const batchId = `import-${Date.now()}`;

  jsonData.forEach((row, idx) => {
    const vehicle: Partial<VehicleRaw> = { id: `raw-${idx}`, import_batch_id: batchId, row_number: idx + 1 };

    Object.entries(columnMapping).forEach(([excelCol, dbColumn]) => {
      const val = row[excelCol];
      if (DATE_FIELDS.has(dbColumn)) {
        (vehicle as Record<string, unknown>)[dbColumn] = parseExcelDate(val);
      } else {
        (vehicle as Record<string, unknown>)[dbColumn] = val ? String(val).trim() : undefined;
      }
    });

    if (!vehicle.chassis_no) {
      issues.push({ id: `iss-${idx}-chassis`, chassisNo: '', field: 'chassis_no', issueType: 'missing', message: `Row ${idx + 1}: Missing chassis number`, severity: 'error', importBatchId: batchId });
    }

    vehicle.is_d2d = vehicle.remark?.toLowerCase().includes('d2d') || vehicle.remark?.toLowerCase().includes('transfer') || false;
    rows.push(vehicle as VehicleRaw);
  });

  const chassisCount = new Map<string, number>();
  rows.forEach(r => { if (r.chassis_no) chassisCount.set(r.chassis_no, (chassisCount.get(r.chassis_no) || 0) + 1); });
  chassisCount.forEach((count, chassis) => {
    if (count > 1) issues.push({ id: `iss-dup-${chassis}`, chassisNo: chassis, field: 'chassis_no', issueType: 'duplicate', message: `Chassis ${chassis} appears ${count} times`, severity: 'warning', importBatchId: batchId });
  });

  return { rows, issues, missingColumns };
}

export function publishCanonical(rows: VehicleRaw[]): { canonical: VehicleCanonical[]; issues: DataQualityIssue[] } {
  const grouped = new Map<string, VehicleRaw[]>();
  rows.filter(r => r.chassis_no).forEach(r => {
    const arr = grouped.get(r.chassis_no) || [];
    arr.push(r);
    grouped.set(r.chassis_no, arr);
  });

  const canonical: VehicleCanonical[] = [];
  const issues: DataQualityIssue[] = [];

  grouped.forEach((group, chassis) => {
    const best = group.sort((a, b) => {
      const countFields = (v: VehicleRaw) => Object.values(v).filter(x => x !== undefined && x !== '').length;
      return countFields(b) - countFields(a);
    })[0];

    const diffDays = (from?: string, to?: string): number | null => {
      if (!from || !to) return null;
      return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    };

    const v: VehicleCanonical = {
      id: `canon-${chassis}`,
      chassis_no: chassis,
      bg_date: best.bg_date,
      shipment_etd_pkg: best.shipment_etd_pkg,
      shipment_eta_kk_twu_sdk: best.shipment_eta_kk_twu_sdk,
      date_received_by_outlet: best.date_received_by_outlet,
      reg_date: best.reg_date,
      delivery_date: best.delivery_date,
      disb_date: best.disb_date,
      branch_code: best.branch_code || 'Unknown',
      model: best.model || 'Unknown',
      payment_method: best.payment_method || 'Unknown',
      salesman_name: best.salesman_name || 'Unknown',
      customer_name: best.customer_name || 'Unknown',
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
      // New flow: BG → ETD → Outlet → Reg → Delivery → Disb
      bg_to_delivery: diffDays(best.bg_date, best.delivery_date),
      bg_to_shipment_etd: diffDays(best.bg_date, best.shipment_etd_pkg),
      etd_to_outlet: diffDays(best.shipment_etd_pkg, best.date_received_by_outlet),
      outlet_to_reg: diffDays(best.date_received_by_outlet, best.reg_date),
      reg_to_delivery: diffDays(best.reg_date, best.delivery_date),
      bg_to_disb: diffDays(best.bg_date, best.disb_date),
      delivery_to_disb: diffDays(best.delivery_date, best.disb_date),
    };

    const kpiFields = [
      ['bg_to_delivery', 'BG→Delivery'], ['bg_to_shipment_etd', 'BG→ETD'], ['etd_to_outlet', 'ETD→Outlet'],
      ['outlet_to_reg', 'Outlet→Reg'], ['reg_to_delivery', 'Reg→Delivery'],
      ['bg_to_disb', 'BG→Disb'], ['delivery_to_disb', 'Delivery→Disb'],
    ] as const;

    kpiFields.forEach(([field, label]) => {
      const val = v[field];
      if (val !== null && val !== undefined && val < 0) {
        issues.push({ id: `neg-${chassis}-${field}`, chassisNo: chassis, field, issueType: 'negative', message: `${label} is negative (${val} days)`, severity: 'error', importBatchId: best.import_batch_id });
      }
    });

    canonical.push(v);
  });

  return { canonical, issues };
}
