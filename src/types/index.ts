// ===== User & Auth =====
export type AppRole = 'super_admin' | 'company_admin' | 'director' | 'general_manager' | 'manager' | 'sales' | 'accounts' | 'analyst';

export interface User {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  avatar?: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  companyId: string;
}

// ===== Import Pipeline =====
export type ImportStatus = 'uploaded' | 'validating' | 'validated' | 'normalization_in_progress' | 'normalization_complete' | 'publish_in_progress' | 'published' | 'failed';

export interface ImportBatch {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  publishedAt?: string;
}

// ===== Vehicle =====
export interface VehicleRaw {
  id: string;
  importBatchId: string;
  rowNumber: number;
  chassisNo: string;
  bgDate?: string;
  shipmentEtdPkg?: string;
  shipmentEtaKkTwuSdk?: string;
  dateReceivedByOutlet?: string;
  deliveryDate?: string;
  disbDate?: string;
  branch?: string;
  model?: string;
  paymentMethod?: string;
  salesman?: string;
  customerName?: string;
  remarks?: string;
  vaaDate?: string;
  fullPaymentDate?: string;
  regDate?: string;
  isD2D?: boolean;
}

export interface VehicleCanonical {
  id: string;
  chassisNo: string;
  bgDate?: string;
  shipmentEtdPkg?: string;
  shipmentEtaKkTwuSdk?: string;
  dateReceivedByOutlet?: string;
  deliveryDate?: string;
  disbDate?: string;
  branch: string;
  model: string;
  paymentMethod: string;
  salesman: string;
  customerName: string;
  remarks?: string;
  vaaDate?: string;
  fullPaymentDate?: string;
  regDate?: string;
  isD2D: boolean;
  importBatchId: string;
  sourceRowId: string;
  // Computed KPIs
  bgToDelivery?: number | null;
  bgToShipmentEtd?: number | null;
  etdToEta?: number | null;
  etaToOutletReceived?: number | null;
  outletReceivedToDelivery?: number | null;
  bgToDisb?: number | null;
  deliveryToDisb?: number | null;
}

// ===== KPI =====
export interface KpiDefinition {
  id: string;
  label: string;
  shortLabel: string;
  fromField: keyof VehicleCanonical;
  toField: keyof VehicleCanonical;
  computedField: keyof VehicleCanonical;
  slaDefault: number;
}

export interface KpiSummary {
  kpiId: string;
  label: string;
  shortLabel: string;
  validCount: number;
  invalidCount: number;
  missingCount: number;
  median: number;
  average: number;
  p90: number;
  overdueCount: number;
  slaDays: number;
}

// ===== Data Quality =====
export interface DataQualityIssue {
  id: string;
  chassisNo: string;
  field: string;
  issueType: 'missing' | 'invalid' | 'negative' | 'duplicate' | 'format_error';
  message: string;
  severity: 'warning' | 'error';
  importBatchId: string;
}

// ===== SLA =====
export interface SlaPolicy {
  id: string;
  kpiId: string;
  label: string;
  slaDays: number;
  companyId: string;
}

// ===== Notification =====
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
  userId: string;
}

// ===== Audit =====
export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

// ===== Module =====
export interface PlatformModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'coming_soon' | 'planned';
  path?: string;
}
