export type AppRole =
  | "super_admin"
  | "company_admin"
  | "director"
  | "general_manager"
  | "manager"
  | "sales"
  | "accounts"
  | "analyst";

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

export interface PermissionGrant {
  resource: string;
  actions: string[];
  companyId: string;
  branchIds?: string[];
}

export interface AuthSession {
  token: string;
  user: User;
  permissions: PermissionGrant[];
  expiresAt: string;
  provider: "dev-jwt" | "oidc" | "supabase";
}

export type ImportStatus =
  | "uploaded"
  | "validating"
  | "validated"
  | "normalization_in_progress"
  | "normalization_complete"
  | "publish_in_progress"
  | "published"
  | "failed";

export type ImportPublishMode = "replace" | "merge";

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
  previewAvailable?: boolean;
  storageKey?: string;
  datasetVersionId?: string;
  publishMode?: ImportPublishMode;
}

export interface DatasetVersion {
  id: string;
  companyId: string;
  importBatchId: string;
  createdAt: string;
  promotedAt?: string;
  status: "draft" | "active" | "rolled_back" | "superseded";
  qualityScore: number;
  rowCount: number;
}

export interface VehicleRaw {
  id: string;
  import_batch_id: string;
  row_number: number;
  chassis_no: string;
  bg_date?: string;
  shipment_etd_pkg?: string;
  shipment_eta_kk_twu_sdk?: string;
  date_received_by_outlet?: string;
  delivery_date?: string;
  disb_date?: string;
  branch_code?: string;
  model?: string;
  payment_method?: string;
  salesman_name?: string;
  customer_name?: string;
  remark?: string;
  vaa_date?: string;
  full_payment_date?: string;
  reg_date?: string;
  is_d2d?: boolean;
  source_row_no?: string;
  variant?: string;
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
}

export interface VehicleCanonical {
  id: string;
  chassis_no: string;
  bg_date?: string;
  shipment_etd_pkg?: string;
  shipment_eta_kk_twu_sdk?: string;
  date_received_by_outlet?: string;
  delivery_date?: string;
  disb_date?: string;
  branch_code: string;
  model: string;
  payment_method: string;
  salesman_name: string;
  customer_name: string;
  remark?: string;
  vaa_date?: string;
  full_payment_date?: string;
  reg_date?: string;
  is_d2d: boolean;
  import_batch_id: string;
  source_row_id: string;
  variant?: string;
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
  bg_to_delivery?: number | null;
  bg_to_shipment_etd?: number | null;
  etd_to_eta?: number | null;
  eta_to_outlet_received?: number | null;
  outlet_received_to_delivery?: number | null;
  bg_to_disb?: number | null;
  delivery_to_disb?: number | null;
}

export interface MetricDefinition {
  id: string;
  label: string;
  shortLabel: string;
  fromField: keyof VehicleCanonical;
  toField: keyof VehicleCanonical;
  computedField: keyof VehicleCanonical;
  slaDefault: number;
  dimensions: string[];
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

export interface DataQualityIssue {
  id: string;
  chassisNo: string;
  field: string;
  issueType: "missing" | "invalid" | "negative" | "duplicate" | "format_error";
  message: string;
  severity: "warning" | "error";
  importBatchId: string;
}

export interface SlaPolicy {
  id: string;
  kpiId: string;
  label: string;
  slaDays: number;
  companyId: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  read: boolean;
  createdAt: string;
  userId: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  name: string;
  metricId: string;
  threshold: number;
  comparator: "gt" | "gte" | "lt" | "lte";
  frequency: "hourly" | "daily" | "weekly";
  enabled: boolean;
  channel: "email" | "in_app";
  createdBy: string;
  companyId: string;
}

export interface PlatformModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "active" | "coming_soon" | "planned";
  path?: string;
}

export interface NavigationItem {
  label: string;
  path: string;
  icon: string;
  section: string;
  roles?: AppRole[];
}

export interface BranchComparison {
  branch: string;
  bgToDelivery: number;
  etdToEta: number;
  outletToDelivery: number;
}

export interface TrendPoint {
  month: string;
  "BG→Delivery": number;
  "ETD→ETA": number;
  "Outlet→Delivery": number;
}

export interface PaymentDistribution {
  name: string;
  value: number;
  avg: number;
}

export interface OutlierPoint {
  chassisNo: string;
  branch: string;
  bgToDelivery: number;
  etdToEta: number;
}

export interface StockSnapshot {
  openStock: number;
  pendingShipment: number;
  inTransit: number;
  atOutlet: number;
  deliveredPendingDisbursement: number;
  disbursed: number;
  d2dOpenTransfers: number;
  aged30Plus: number;
  aged60Plus: number;
  aged90Plus: number;
}

export interface FilterOptions {
  branches: string[];
  models: string[];
  payments: string[];
}

export interface AgingSummary {
  totalVehicles: number;
  totalOverdue: number;
  totalIssues: number;
  importCount: number;
  lastRefresh: string;
  latestImport?: ImportBatch;
  kpiSummaries: KpiSummary[];
  branchComparison: BranchComparison[];
  trend: TrendPoint[];
  paymentDistribution: PaymentDistribution[];
  outliers: OutlierPoint[];
  stockSnapshot: StockSnapshot;
  qualityPreview: DataQualityIssue[];
  slowestVehicles: VehicleCanonical[];
  filterOptions: FilterOptions;
}

export interface ExplorerQuery {
  search?: string;
  branch?: string;
  model?: string;
  payment?: string;
  page: number;
  pageSize: number;
  sortField?: keyof VehicleCanonical;
  sortDirection?: "asc" | "desc";
}

export interface ExplorerResult {
  items: VehicleCanonical[];
  total: number;
  page: number;
  pageSize: number;
  filterOptions: FilterOptions;
}
