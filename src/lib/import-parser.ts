import * as XLSX from 'xlsx';
import { VehicleRaw, DataQualityIssue, VehicleCanonical } from '@/types';

const COLUMN_MAP: Record<string, keyof VehicleRaw> = {
  'CHASSIS NO.': 'chassisNo',
  'CHASSIS NO': 'chassisNo',
  'BG DATE': 'bgDate',
  'SHIPMENT ETD PKG': 'shipmentEtdPkg',
  'SHIPMENT ETA KK/TWU/SDK': 'shipmentEtaKkTwuSdk',
  'SHIPMENT ETA': 'shipmentEtaKkTwuSdk',
  'DATE RECEIVED BY OUTLET': 'dateReceivedByOutlet',
  'DELIVERY DATE': 'deliveryDate',
  'DISB. DATE': 'disbDate',
  'DISB DATE': 'disbDate',
  'BRCH': 'branch',
  'BRANCH': 'branch',
  'MODEL': 'model',
  'PAYMENT METHOD': 'paymentMethod',
  'SALESMAN': 'salesman',
  'CUSTOMER NAME': 'customerName',
  'REMARKS': 'remarks',
  'VAA DATE': 'vaaDate',
  'FULL PAYMENT DATE': 'fullPaymentDate',
  'REG DATE': 'regDate',
};

const REQUIRED_COLUMNS = ['chassisNo', 'bgDate', 'branch', 'model'];

function parseExcelDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return undefined;
}

const dateFields = new Set(['bgDate', 'shipmentEtdPkg', 'shipmentEtaKkTwuSdk', 'dateReceivedByOutlet', 'deliveryDate', 'disbDate', 'vaaDate', 'fullPaymentDate', 'regDate']);

export function parseWorkbook(file: ArrayBuffer): { rows: VehicleRaw[]; issues: DataQualityIssue[]; missingColumns: string[] } {
  const wb = XLSX.read(file, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('combine')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (jsonData.length === 0) return { rows: [], issues: [], missingColumns: ['No data found'] };

  const headers = Object.keys(jsonData[0]);
  const columnMapping: Record<string, string> = {};
  headers.forEach(h => {
    const normalized = h.trim().toUpperCase();
    if (COLUMN_MAP[normalized]) columnMapping[h] = COLUMN_MAP[normalized];
  });

  const missingColumns = REQUIRED_COLUMNS.filter(rc => !Object.values(columnMapping).includes(rc));

  const rows: VehicleRaw[] = [];
  const issues: DataQualityIssue[] = [];
  const batchId = `import-${Date.now()}`;

  jsonData.forEach((row, idx) => {
    const vehicle: Partial<VehicleRaw> = { id: `raw-${idx}`, importBatchId: batchId, rowNumber: idx + 1 };
    
    Object.entries(columnMapping).forEach(([excelCol, fieldName]) => {
      const val = row[excelCol];
      if (dateFields.has(fieldName)) {
        (vehicle as Record<string, unknown>)[fieldName] = parseExcelDate(val);
      } else {
        (vehicle as Record<string, unknown>)[fieldName] = val ? String(val).trim() : undefined;
      }
    });

    if (!vehicle.chassisNo) {
      issues.push({ id: `iss-${idx}-chassis`, chassisNo: '', field: 'chassisNo', issueType: 'missing', message: `Row ${idx + 1}: Missing chassis number`, severity: 'error', importBatchId: batchId });
    }

    vehicle.isD2D = vehicle.remarks?.toLowerCase().includes('d2d') || vehicle.remarks?.toLowerCase().includes('transfer') || false;
    rows.push(vehicle as VehicleRaw);
  });

  // Detect duplicates
  const chassisCount = new Map<string, number>();
  rows.forEach(r => { if (r.chassisNo) chassisCount.set(r.chassisNo, (chassisCount.get(r.chassisNo) || 0) + 1); });
  chassisCount.forEach((count, chassis) => {
    if (count > 1) issues.push({ id: `iss-dup-${chassis}`, chassisNo: chassis, field: 'chassisNo', issueType: 'duplicate', message: `Chassis ${chassis} appears ${count} times`, severity: 'warning', importBatchId: batchId });
  });

  return { rows, issues, missingColumns };
}

export function publishCanonical(rows: VehicleRaw[]): { canonical: VehicleCanonical[]; issues: DataQualityIssue[] } {
  const grouped = new Map<string, VehicleRaw[]>();
  rows.filter(r => r.chassisNo).forEach(r => {
    const arr = grouped.get(r.chassisNo) || [];
    arr.push(r);
    grouped.set(r.chassisNo, arr);
  });

  const canonical: VehicleCanonical[] = [];
  const issues: DataQualityIssue[] = [];

  grouped.forEach((group, chassis) => {
    // Pick the row with most filled fields
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
      chassisNo: chassis,
      bgDate: best.bgDate,
      shipmentEtdPkg: best.shipmentEtdPkg,
      shipmentEtaKkTwuSdk: best.shipmentEtaKkTwuSdk,
      dateReceivedByOutlet: best.dateReceivedByOutlet,
      deliveryDate: best.deliveryDate,
      disbDate: best.disbDate,
      branch: best.branch || 'Unknown',
      model: best.model || 'Unknown',
      paymentMethod: best.paymentMethod || 'Unknown',
      salesman: best.salesman || 'Unknown',
      customerName: best.customerName || 'Unknown',
      remarks: best.remarks,
      vaaDate: best.vaaDate,
      fullPaymentDate: best.fullPaymentDate,
      regDate: best.regDate,
      isD2D: best.isD2D || false,
      importBatchId: best.importBatchId,
      sourceRowId: best.id,
      bgToDelivery: diffDays(best.bgDate, best.deliveryDate),
      bgToShipmentEtd: diffDays(best.bgDate, best.shipmentEtdPkg),
      etdToEta: diffDays(best.shipmentEtdPkg, best.shipmentEtaKkTwuSdk),
      etaToOutletReceived: diffDays(best.shipmentEtaKkTwuSdk, best.dateReceivedByOutlet),
      outletReceivedToDelivery: diffDays(best.dateReceivedByOutlet, best.deliveryDate),
      bgToDisb: diffDays(best.bgDate, best.disbDate),
      deliveryToDisb: diffDays(best.deliveryDate, best.disbDate),
    };

    // Log negative KPIs as issues
    const kpiFields = [
      ['bgToDelivery', 'BG→Delivery'], ['bgToShipmentEtd', 'BG→ETD'], ['etdToEta', 'ETD→ETA'],
      ['etaToOutletReceived', 'ETA→Outlet'], ['outletReceivedToDelivery', 'Outlet→Delivery'],
      ['bgToDisb', 'BG→Disb'], ['deliveryToDisb', 'Delivery→Disb'],
    ] as const;

    kpiFields.forEach(([field, label]) => {
      const val = v[field];
      if (val !== null && val !== undefined && val < 0) {
        issues.push({ id: `neg-${chassis}-${field}`, chassisNo: chassis, field, issueType: 'negative', message: `${label} is negative (${val} days)`, severity: 'error', importBatchId: best.importBatchId });
      }
    });

    canonical.push(v);
  });

  return { canonical, issues };
}
