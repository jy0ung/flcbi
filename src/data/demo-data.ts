import { VehicleCanonical, ImportBatch, DataQualityIssue, Notification, AuditLog, Branch, Company, User, SlaPolicy, PlatformModule } from '@/types';
import { KPI_DEFINITIONS } from './kpi-definitions';

const branches = ['KK', 'TWU', 'SDK', 'LDU', 'BTU', 'MYY', 'SBW'];
const models = ['ATIVA', 'MYVI', 'AXIA', 'ALZA', 'ARUZ', 'BEZZA', 'VIVA'];
const payments = ['Cash', 'Loan', 'Government'];
const salesmen = ['Ahmad Razali', 'Siti Aminah', 'James Wong', 'Kumar Raj', 'Lisa Tan', 'Ali Hassan'];

function randDate(start: string, addDays: number): string {
  const d = new Date(start);
  d.setDate(d.getDate() + addDays);
  return d.toISOString().split('T')[0];
}
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

function generateVehicles(count: number): VehicleCanonical[] {
  const vehicles: VehicleCanonical[] = [];
  for (let i = 0; i < count; i++) {
    const bgBase = `2024-${String(rand(1, 12)).padStart(2, '0')}-${String(rand(1, 28)).padStart(2, '0')}`;
    const bgToEtd = rand(3, 20);
    const etdToEta = rand(5, 30);
    const etaToOutlet = rand(1, 10);
    const outletToDelivery = rand(1, 20);
    const deliveryToDisb = rand(-5, 20);
    const isD2D = Math.random() < 0.1;
    const hasMissing = Math.random() < 0.08;

    const bg = bgBase;
    const etd = hasMissing && Math.random() < 0.5 ? undefined : randDate(bg, bgToEtd);
    const eta = etd ? randDate(etd, etdToEta) : undefined;
    const outlet = eta ? randDate(eta, etaToOutlet) : undefined;
    const delivery = outlet ? randDate(outlet, outletToDelivery) : (hasMissing ? undefined : randDate(bg, bgToEtd + etdToEta + etaToOutlet + outletToDelivery));
    const disb = delivery ? randDate(delivery, deliveryToDisb) : undefined;

    const diffDays = (a?: string, b?: string) => {
      if (!a || !b) return null;
      const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
      return diff;
    };

    vehicles.push({
      id: `v-${i + 1}`,
      chassisNo: `PMK${String(rand(100000, 999999))}${String.fromCharCode(65 + rand(0, 25))}`,
      bgDate: bg,
      shipmentEtdPkg: etd,
      shipmentEtaKkTwuSdk: eta,
      dateReceivedByOutlet: outlet,
      deliveryDate: delivery,
      disbDate: disb,
      branch: pick(branches),
      model: pick(models),
      paymentMethod: pick(payments),
      salesman: pick(salesmen),
      customerName: `Customer ${i + 1}`,
      isD2D,
      importBatchId: 'batch-1',
      sourceRowId: `raw-${i + 1}`,
      bgToDelivery: diffDays(bg, delivery),
      bgToShipmentEtd: diffDays(bg, etd),
      etdToEta: diffDays(etd, eta),
      etaToOutletReceived: diffDays(eta, outlet),
      outletReceivedToDelivery: diffDays(outlet, delivery),
      bgToDisb: diffDays(bg, disb),
      deliveryToDisb: diffDays(delivery, disb),
    });
  }
  return vehicles;
}

export const demoVehicles = generateVehicles(250);

export const demoCompany: Company = { id: 'c1', name: 'FLC Auto Group', code: 'FLC' };

export const demoBranches: Branch[] = branches.map((b, i) => ({ id: `br-${i}`, name: b, code: b, companyId: 'c1' }));

export const demoUser: User = {
  id: 'u1', email: 'director@flc.com', name: 'Sarah Chen', role: 'director', companyId: 'c1',
};

export const demoImportBatches: ImportBatch[] = [
  { id: 'batch-1', fileName: 'FLC_Combined_Jan2024.xlsx', uploadedBy: 'Sarah Chen', uploadedAt: '2024-01-15T09:30:00Z', status: 'published', totalRows: 250, validRows: 230, errorRows: 12, duplicateRows: 8, publishedAt: '2024-01-15T09:35:00Z' },
  { id: 'batch-2', fileName: 'FLC_Combined_Dec2023.xlsx', uploadedBy: 'James Wong', uploadedAt: '2023-12-20T14:00:00Z', status: 'published', totalRows: 180, validRows: 170, errorRows: 6, duplicateRows: 4, publishedAt: '2023-12-20T14:10:00Z' },
];

export const demoQualityIssues: DataQualityIssue[] = [
  { id: 'dq1', chassisNo: demoVehicles[0]?.chassisNo ?? '', field: 'shipmentEtdPkg', issueType: 'missing', message: 'Shipment ETD date is missing', severity: 'warning', importBatchId: 'batch-1' },
  { id: 'dq2', chassisNo: demoVehicles[1]?.chassisNo ?? '', field: 'deliveryToDisb', issueType: 'negative', message: 'Disbursement before delivery (-3 days)', severity: 'error', importBatchId: 'batch-1' },
  { id: 'dq3', chassisNo: demoVehicles[2]?.chassisNo ?? '', field: 'deliveryDate', issueType: 'missing', message: 'Delivery date is missing', severity: 'warning', importBatchId: 'batch-1' },
];

export const demoSLAs: SlaPolicy[] = KPI_DEFINITIONS.map(k => ({
  id: `sla-${k.id}`, kpiId: k.id, label: k.shortLabel, slaDays: k.slaDefault, companyId: 'c1',
}));

export const demoNotifications: Notification[] = [
  { id: 'n1', title: 'Import Complete', message: 'FLC_Combined_Jan2024.xlsx has been published successfully.', type: 'success', read: false, createdAt: '2024-01-15T09:35:00Z', userId: 'u1' },
  { id: 'n2', title: 'SLA Breach Alert', message: '12 vehicles exceeded BG→Delivery SLA of 45 days.', type: 'warning', read: false, createdAt: '2024-01-15T10:00:00Z', userId: 'u1' },
  { id: 'n3', title: 'Data Quality Warning', message: '8 vehicles have missing date fields.', type: 'warning', read: true, createdAt: '2024-01-14T16:00:00Z', userId: 'u1' },
];

export const demoAuditLogs: AuditLog[] = [
  { id: 'a1', action: 'import_published', entity: 'import_batch', entityId: 'batch-1', userId: 'u1', userName: 'Sarah Chen', details: 'Published 250 vehicles from FLC_Combined_Jan2024.xlsx', createdAt: '2024-01-15T09:35:00Z' },
  { id: 'a2', action: 'sla_updated', entity: 'sla_policy', entityId: 'sla-bg_to_delivery', userId: 'u1', userName: 'Sarah Chen', details: 'Updated BG→Delivery SLA from 60 to 45 days', createdAt: '2024-01-14T11:00:00Z' },
];

export const platformModules: PlatformModule[] = [
  { id: 'auto-aging', name: 'Auto Aging', description: 'Vehicle aging analysis across operational milestones', icon: 'Timer', status: 'active', path: '/auto-aging' },
  { id: 'finance', name: 'Finance Intelligence', description: 'Financial performance analytics and reporting', icon: 'DollarSign', status: 'coming_soon' },
  { id: 'sales', name: 'Sales Intelligence', description: 'Sales pipeline and performance tracking', icon: 'TrendingUp', status: 'coming_soon' },
  { id: 'operations', name: 'Operations Intelligence', description: 'Operational efficiency and bottleneck analysis', icon: 'Settings', status: 'coming_soon' },
  { id: 'inventory', name: 'Inventory Intelligence', description: 'Stock management and movement tracking', icon: 'Package', status: 'planned' },
  { id: 'crm', name: 'CRM / Customer Intelligence', description: 'Customer relationship and satisfaction insights', icon: 'Users', status: 'planned' },
  { id: 'hr', name: 'HR / People Intelligence', description: 'Workforce analytics and talent management', icon: 'UserCheck', status: 'planned' },
  { id: 'forecasting', name: 'Forecasting & AI Insights', description: 'Predictive analytics and AI recommendations', icon: 'Brain', status: 'planned' },
];

// Compute KPI summaries
export function computeKpiSummaries(vehicles: VehicleCanonical[], slas: SlaPolicy[]): import('@/types').KpiSummary[] {
  return KPI_DEFINITIONS.map(kpi => {
    const sla = slas.find(s => s.kpiId === kpi.id);
    const slaDays = sla?.slaDays ?? kpi.slaDefault;
    const values: number[] = [];
    let invalidCount = 0;
    let missingCount = 0;

    vehicles.forEach(v => {
      const val = v[kpi.computedField] as number | null | undefined;
      if (val === null || val === undefined) missingCount++;
      else if (val < 0) invalidCount++;
      else values.push(val);
    });

    values.sort((a, b) => a - b);
    const validCount = values.length;
    const median = validCount > 0 ? values[Math.floor(validCount / 2)] : 0;
    const average = validCount > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / validCount) : 0;
    const p90 = validCount > 0 ? values[Math.floor(validCount * 0.9)] : 0;
    const overdueCount = values.filter(v => v > slaDays).length;

    return { kpiId: kpi.id, label: kpi.label, shortLabel: kpi.shortLabel, validCount, invalidCount, missingCount, median, average, p90, overdueCount, slaDays };
  });
}
