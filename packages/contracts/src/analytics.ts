import type {
  AgingSummary,
  BranchComparison,
  DashboardPreferences,
  DataQualityIssue,
  ExplorerDateRangeFilter,
  ExplorerColumnFilterSet,
  ExplorerFilterSet,
  ExecutiveDashboardMetricId,
  ExplorerPreset,
  ExplorerQuery,
  ExplorerNumberRangeFilter,
  ExplorerResult,
  FilterOptions,
  ImportBatch,
  KpiSummary,
  NavigationItem,
  OutlierPoint,
  PaymentDistribution,
  PlatformModule,
  SlaPolicy,
  StockSnapshot,
  TrendPoint,
  VehicleCanonical,
  WorkbookExplorerColumn,
  WorkbookExplorerColumnKind,
  WorkbookExplorerRow,
} from "./domain.js";
import { KPI_DEFINITIONS } from "./kpis.js";

export const EXECUTIVE_DASHBOARD_METRIC_OPTIONS: Array<{
  id: ExecutiveDashboardMetricId;
  label: string;
  description: string;
  group: "pipeline" | "operations" | "risk" | "kpi";
}> = [
  { id: "open_stock", label: "Open Stock", description: "All units not yet delivered.", group: "pipeline" },
  { id: "pending_shipment", label: "Pending Shipment", description: "Open units with no ETD yet.", group: "pipeline" },
  { id: "in_transit", label: "In Transit", description: "Open units already shipped but not yet received by outlet.", group: "pipeline" },
  { id: "at_outlet", label: "At Outlet", description: "Open units received by outlet but not yet registered.", group: "pipeline" },
  { id: "registered_pending_delivery", label: "Registered Pending Delivery", description: "Open units already registered and waiting for delivery.", group: "pipeline" },
  { id: "pending_disbursement", label: "Pending Disbursement", description: "Delivered units waiting for disbursement.", group: "pipeline" },
  { id: "disbursed", label: "Disbursed", description: "Units already disbursed.", group: "pipeline" },
  { id: "tracked_units", label: "Tracked Units", description: "All live canonical vehicles in the current dataset.", group: "operations" },
  { id: "import_batches", label: "Import Batches", description: "Imports retained in history.", group: "operations" },
  { id: "sla_breaches", label: "SLA Breaches", description: "Overdue KPI measurements across active metrics.", group: "operations" },
  { id: "quality_issues", label: "Quality Issues", description: "Current data quality findings for the filtered scope.", group: "operations" },
  { id: "aged_30_plus", label: "30+ Days Open", description: "Open units aged 30 days or more from BG date.", group: "risk" },
  { id: "aged_60_plus", label: "60+ Days Open", description: "Open units aged 60 days or more from BG date.", group: "risk" },
  { id: "aged_90_plus", label: "90+ Days Open", description: "Open units aged 90 days or more from BG date.", group: "risk" },
  { id: "d2d_open", label: "Open D2D", description: "Open D2D or transfer units.", group: "risk" },
  { id: "bg_to_delivery_median", label: "BG -> Delivery", description: "Median BG to delivery duration.", group: "kpi" },
  { id: "bg_to_shipment_etd_median", label: "BG -> Shipment ETD", description: "Median BG to ETD duration.", group: "kpi" },
  { id: "etd_to_outlet_median", label: "ETD -> Outlet Received", description: "Median ETD to outlet-received duration.", group: "kpi" },
  { id: "outlet_to_reg_median", label: "Outlet -> Register Date", description: "Median outlet to register duration.", group: "kpi" },
  { id: "reg_to_delivery_median", label: "Register Date -> Delivery", description: "Median register to delivery duration.", group: "kpi" },
  { id: "bg_to_disb_median", label: "BG -> Disbursement", description: "Median BG to disbursement duration.", group: "kpi" },
  { id: "delivery_to_disb_median", label: "Delivery -> Disbursement", description: "Median delivery to disbursement duration.", group: "kpi" },
];

export const EXECUTIVE_DASHBOARD_METRIC_IDS = EXECUTIVE_DASHBOARD_METRIC_OPTIONS.map(
  (metric) => metric.id,
);

export const DEFAULT_EXECUTIVE_DASHBOARD_METRIC_IDS: ExecutiveDashboardMetricId[] = [
  "tracked_units",
  "open_stock",
  "registered_pending_delivery",
  "pending_disbursement",
  "quality_issues",
  "bg_to_shipment_etd_median",
];

export const MAX_EXECUTIVE_DASHBOARD_METRICS = 6;

export const EXPLORER_PRESET_LABELS: Record<ExplorerPreset, string> = {
  open_stock: "Open Stock",
  pending_shipment: "Pending Shipment",
  in_transit: "In Transit",
  at_outlet: "At Outlet",
  registered_pending_delivery: "Registered Pending Delivery",
  pending_disbursement: "Pending Disbursement",
  disbursed: "Disbursed",
  aged_30_plus: "30+ Days Open",
  aged_60_plus: "60+ Days Open",
  aged_90_plus: "90+ Days Open",
  d2d_open: "Open D2D",
};

export function normalizeExecutiveDashboardMetricIds(
  metricIds?: string[] | null,
): ExecutiveDashboardMetricId[] {
  const allowedIds = new Set(EXECUTIVE_DASHBOARD_METRIC_IDS);
  const normalized = (metricIds ?? []).filter(
    (metricId): metricId is ExecutiveDashboardMetricId =>
      allowedIds.has(metricId as ExecutiveDashboardMetricId),
  );

  if (normalized.length === 0) {
    return [...DEFAULT_EXECUTIVE_DASHBOARD_METRIC_IDS];
  }

  return [...new Set(normalized)].slice(0, MAX_EXECUTIVE_DASHBOARD_METRICS);
}

export function createDefaultDashboardPreferences(): DashboardPreferences {
  return {
    executiveMetricIds: [...DEFAULT_EXECUTIVE_DASHBOARD_METRIC_IDS],
  };
}

export function getExecutiveDashboardMetricOption(metricId: ExecutiveDashboardMetricId) {
  return EXECUTIVE_DASHBOARD_METRIC_OPTIONS.find((metric) => metric.id === metricId);
}

export function getExecutiveMetricValue(summary: AgingSummary, metricId: ExecutiveDashboardMetricId): number {
  switch (metricId) {
    case "open_stock":
      return summary.stockSnapshot.openStock;
    case "pending_shipment":
      return summary.stockSnapshot.pendingShipment;
    case "in_transit":
      return summary.stockSnapshot.inTransit;
    case "at_outlet":
      return summary.stockSnapshot.atOutlet;
    case "registered_pending_delivery":
      return summary.stockSnapshot.registeredPendingDelivery;
    case "pending_disbursement":
      return summary.stockSnapshot.deliveredPendingDisbursement;
    case "disbursed":
      return summary.stockSnapshot.disbursed;
    case "tracked_units":
      return summary.totalVehicles;
    case "import_batches":
      return summary.importCount;
    case "sla_breaches":
      return summary.totalOverdue;
    case "quality_issues":
      return summary.totalIssues;
    case "aged_30_plus":
      return summary.stockSnapshot.aged30Plus;
    case "aged_60_plus":
      return summary.stockSnapshot.aged60Plus;
    case "aged_90_plus":
      return summary.stockSnapshot.aged90Plus;
    case "d2d_open":
      return summary.stockSnapshot.d2dOpenTransfers;
    case "bg_to_delivery_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "bg_to_delivery")?.median ?? 0;
    case "bg_to_shipment_etd_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "bg_to_shipment_etd")?.median ?? 0;
    case "etd_to_outlet_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "etd_to_outlet")?.median ?? 0;
    case "outlet_to_reg_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "outlet_to_reg")?.median ?? 0;
    case "reg_to_delivery_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "reg_to_delivery")?.median ?? 0;
    case "bg_to_disb_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "bg_to_disb")?.median ?? 0;
    case "delivery_to_disb_median":
      return summary.kpiSummaries.find((kpi) => kpi.kpiId === "delivery_to_disb")?.median ?? 0;
    default:
      return 0;
  }
}

export function compareMetricValue(
  value: number,
  comparator: "gt" | "gte" | "lt" | "lte",
  threshold: number,
): boolean {
  switch (comparator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    default:
      return false;
  }
}

export const platformModules: PlatformModule[] = [
  {
    id: "auto-aging",
    name: "Auto Aging",
    description: "Vehicle aging analysis across operational milestones",
    icon: "Timer",
    status: "active",
    path: "/auto-aging",
  },
  {
    id: "finance",
    name: "Finance Intelligence",
    description: "Financial performance analytics and reporting",
    icon: "DollarSign",
    status: "coming_soon",
  },
  {
    id: "sales",
    name: "Sales Intelligence",
    description: "Sales pipeline and performance tracking",
    icon: "TrendingUp",
    status: "coming_soon",
  },
  {
    id: "operations",
    name: "Operations Intelligence",
    description: "Operational efficiency and bottleneck analysis",
    icon: "Settings",
    status: "coming_soon",
  },
];

export const navigationItems: NavigationItem[] = [
  { label: "Executive Dashboard", path: "/", icon: "LayoutDashboard", section: "Platform" },
  { label: "Module Directory", path: "/modules", icon: "Grid3X3", section: "Platform" },
  { label: "Notifications", path: "/notifications", icon: "Bell", section: "Platform" },
  {
    label: "Alert Rules",
    path: "/alerts",
    icon: "AlertTriangle",
    section: "Platform",
    roles: ["super_admin", "company_admin", "director"],
  },
  { label: "Aging Dashboard", path: "/auto-aging", icon: "Timer", section: "Auto Aging" },
  { label: "Vehicle Explorer", path: "/auto-aging/vehicles", icon: "Car", section: "Auto Aging" },
  {
    label: "Exports",
    path: "/auto-aging/exports",
    icon: "Download",
    section: "Auto Aging",
    roles: ["super_admin", "company_admin", "director", "general_manager", "manager", "analyst"],
  },
  {
    label: "Import Center",
    path: "/auto-aging/import",
    icon: "Upload",
    section: "Auto Aging",
    roles: ["super_admin", "company_admin", "director"],
  },
  { label: "Data Quality", path: "/auto-aging/quality", icon: "AlertTriangle", section: "Auto Aging" },
  { label: "SLA Policies", path: "/auto-aging/sla", icon: "Gauge", section: "Auto Aging" },
  {
    label: "Mappings",
    path: "/auto-aging/mappings",
    icon: "Map",
    section: "Auto Aging",
    roles: ["super_admin", "company_admin"],
  },
  { label: "Import History", path: "/auto-aging/history", icon: "History", section: "Auto Aging" },
  { label: "Users & Roles", path: "/admin/users", icon: "Shield", section: "Admin", roles: ["super_admin", "company_admin"] },
  { label: "Audit Log", path: "/admin/audit", icon: "FileText", section: "Admin", roles: ["super_admin", "company_admin", "director"] },
  { label: "Operations", path: "/admin/operations", icon: "Activity", section: "Admin", roles: ["super_admin", "company_admin", "director"] },
  { label: "Settings", path: "/admin/settings", icon: "Settings", section: "Admin" },
];

export function createDefaultSlaPolicies(companyId: string): SlaPolicy[] {
  return KPI_DEFINITIONS.map((kpi) => ({
    id: `sla-${kpi.id}`,
    kpiId: kpi.id,
    label: kpi.shortLabel,
    slaDays: kpi.slaDefault,
    companyId,
  }));
}

export function computeKpiSummaries(
  vehicles: VehicleCanonical[],
  slas: SlaPolicy[],
): KpiSummary[] {
  return KPI_DEFINITIONS.map((kpi) => {
    const sla = slas.find((item) => item.kpiId === kpi.id);
    const slaDays = sla?.slaDays ?? kpi.slaDefault;
    const values: number[] = [];
    let invalidCount = 0;
    let missingCount = 0;

    vehicles.forEach((vehicle) => {
      const value = vehicle[kpi.computedField] as number | null | undefined;
      if (value === null || value === undefined) missingCount += 1;
      else if (value < 0) invalidCount += 1;
      else values.push(value);
    });

    values.sort((left, right) => left - right);
    const validCount = values.length;

    return {
      kpiId: kpi.id,
      label: kpi.label,
      shortLabel: kpi.shortLabel,
      validCount,
      invalidCount,
      missingCount,
      median: validCount > 0 ? values[Math.floor(validCount / 2)] : 0,
      average: validCount > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / validCount) : 0,
      p90: validCount > 0 ? values[Math.floor(validCount * 0.9)] : 0,
      overdueCount: values.filter((value) => value > slaDays).length,
      slaDays,
    };
  });
}

export function buildFilterOptions(vehicles: VehicleCanonical[]): FilterOptions {
  return {
    branches: [...new Set(vehicles.map((vehicle) => vehicle.branch_code))].sort(),
    models: [...new Set(vehicles.map((vehicle) => vehicle.model))].sort(),
    payments: [...new Set(vehicles.map((vehicle) => vehicle.payment_method))].sort(),
  };
}

export function buildBranchComparison(vehicles: VehicleCanonical[]): BranchComparison[] {
  const groups = new Map<string, { bgToDelivery: number[]; etdToOutlet: number[]; regToDelivery: number[] }>();
  vehicles.forEach((vehicle) => {
    const entry = groups.get(vehicle.branch_code) ?? { bgToDelivery: [], etdToOutlet: [], regToDelivery: [] };
    if (vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0) entry.bgToDelivery.push(vehicle.bg_to_delivery);
    if (vehicle.etd_to_outlet_received != null && vehicle.etd_to_outlet_received >= 0) {
      entry.etdToOutlet.push(vehicle.etd_to_outlet_received);
    }
    if (vehicle.reg_to_delivery != null && vehicle.reg_to_delivery >= 0) {
      entry.regToDelivery.push(vehicle.reg_to_delivery);
    }
    groups.set(vehicle.branch_code, entry);
  });

  const average = (values: number[]) =>
    values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return [...groups.entries()]
    .map(([branch, values]) => ({
      branch,
      bgToDelivery: average(values.bgToDelivery),
      etdToOutlet: average(values.etdToOutlet),
      regToDelivery: average(values.regToDelivery),
    }))
    .sort((left, right) => right.bgToDelivery - left.bgToDelivery);
}

export function buildTrend(vehicles: VehicleCanonical[]): TrendPoint[] {
  const monthMap = new Map<string, { bgToDel: number[]; etdToOut: number[]; regToDel: number[] }>();
  vehicles.forEach((vehicle) => {
    if (!vehicle.bg_date) return;
    const month = vehicle.bg_date.slice(0, 7);
    const entry = monthMap.get(month) ?? { bgToDel: [], etdToOut: [], regToDel: [] };
    if (vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0) entry.bgToDel.push(vehicle.bg_to_delivery);
    if (vehicle.etd_to_outlet_received != null && vehicle.etd_to_outlet_received >= 0) {
      entry.etdToOut.push(vehicle.etd_to_outlet_received);
    }
    if (vehicle.reg_to_delivery != null && vehicle.reg_to_delivery >= 0) {
      entry.regToDel.push(vehicle.reg_to_delivery);
    }
    monthMap.set(month, entry);
  });

  const average = (values: number[]) =>
    values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return [...monthMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, values]) => ({
      month,
      "BG→Delivery": average(values.bgToDel),
      "ETD→Out": average(values.etdToOut),
      "Reg→Delivery": average(values.regToDel),
    }));
}

export function buildPaymentDistribution(vehicles: VehicleCanonical[]): PaymentDistribution[] {
  const groups = new Map<string, { count: number; totalDays: number }>();
  vehicles.forEach((vehicle) => {
    const entry = groups.get(vehicle.payment_method) ?? { count: 0, totalDays: 0 };
    entry.count += 1;
    if (vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0) entry.totalDays += vehicle.bg_to_delivery;
    groups.set(vehicle.payment_method, entry);
  });

  return [...groups.entries()].map(([name, values]) => ({
    name,
    value: values.count,
    avg: values.count > 0 ? Math.round(values.totalDays / values.count) : 0,
  }));
}

export function buildOutliers(vehicles: VehicleCanonical[]): OutlierPoint[] {
  return vehicles
    .filter(
      (vehicle) =>
        vehicle.bg_to_delivery != null &&
        vehicle.bg_to_delivery >= 0 &&
        vehicle.etd_to_outlet_received != null &&
        vehicle.etd_to_outlet_received >= 0,
    )
    .map((vehicle) => ({
      chassisNo: vehicle.chassis_no,
      branch: vehicle.branch_code,
      bgToDelivery: vehicle.bg_to_delivery as number,
      etdToOut: vehicle.etd_to_outlet_received as number,
    }));
}

function parseIsoDate(date?: string) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(from?: string, to?: string) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function matchesExplorerPreset(
  vehicle: VehicleCanonical,
  preset?: ExplorerPreset,
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  if (!preset) return true;

  const isOpenStock = !vehicle.delivery_date;
  const openAge = diffDays(vehicle.bg_date, referenceDate);

  switch (preset) {
    case "open_stock":
      return isOpenStock;
    case "pending_shipment":
      return isOpenStock && !vehicle.shipment_etd_pkg;
    case "in_transit":
      return isOpenStock && Boolean(vehicle.shipment_etd_pkg) && !vehicle.date_received_by_outlet;
    case "at_outlet":
      return isOpenStock && Boolean(vehicle.date_received_by_outlet) && !vehicle.reg_date;
    case "registered_pending_delivery":
      return isOpenStock && Boolean(vehicle.reg_date);
    case "pending_disbursement":
      return Boolean(vehicle.delivery_date) && !vehicle.disb_date;
    case "disbursed":
      return Boolean(vehicle.disb_date);
    case "aged_30_plus":
      return isOpenStock && openAge != null && openAge >= 30;
    case "aged_60_plus":
      return isOpenStock && openAge != null && openAge >= 60;
    case "aged_90_plus":
      return isOpenStock && openAge != null && openAge >= 90;
    case "d2d_open":
      return isOpenStock && vehicle.is_d2d;
    default:
      return true;
  }
}

export function buildStockSnapshot(
  vehicles: VehicleCanonical[],
  referenceDate: string,
): StockSnapshot {
  const reference = parseIsoDate(referenceDate) ?? new Date();
  const openVehicles = vehicles.filter((vehicle) => !vehicle.delivery_date);

  const agedByThreshold = (threshold: number) =>
    openVehicles.filter((vehicle) => {
      const age = diffDays(vehicle.bg_date, reference.toISOString().slice(0, 10));
      return age != null && age >= threshold;
    }).length;

  return {
    openStock: openVehicles.length,
    pendingShipment: openVehicles.filter((vehicle) => !vehicle.shipment_etd_pkg).length,
    inTransit: openVehicles.filter(
      (vehicle) => Boolean(vehicle.shipment_etd_pkg) && !vehicle.date_received_by_outlet,
    ).length,
    atOutlet: openVehicles.filter(
      (vehicle) => Boolean(vehicle.date_received_by_outlet) && !vehicle.reg_date,
    ).length,
    registeredPendingDelivery: openVehicles.filter((vehicle) => Boolean(vehicle.reg_date)).length,
    deliveredPendingDisbursement: vehicles.filter(
      (vehicle) => Boolean(vehicle.delivery_date) && !vehicle.disb_date,
    ).length,
    disbursed: vehicles.filter((vehicle) => Boolean(vehicle.disb_date)).length,
    d2dOpenTransfers: openVehicles.filter((vehicle) => vehicle.is_d2d).length,
    aged30Plus: agedByThreshold(30),
    aged60Plus: agedByThreshold(60),
    aged90Plus: agedByThreshold(90),
  };
}

export function buildAgingSummary(
  vehicles: VehicleCanonical[],
  slas: SlaPolicy[],
  qualityIssues: DataQualityIssue[],
  importBatches: ImportBatch[],
  lastRefresh: string,
): AgingSummary {
  const kpiSummaries = computeKpiSummaries(vehicles, slas);
  const stockSnapshot = buildStockSnapshot(vehicles, lastRefresh.slice(0, 10));
  const latestPublishedImport =
    importBatches.find((item) => item.status === "published" || Boolean(item.publishedAt)) ??
    importBatches[0];
  return {
    totalVehicles: vehicles.length,
    totalOverdue: kpiSummaries.reduce((sum, summary) => sum + summary.overdueCount, 0),
    totalIssues: qualityIssues.length,
    importCount: importBatches.length,
    lastRefresh,
    latestImport: latestPublishedImport,
    kpiSummaries,
    branchComparison: buildBranchComparison(vehicles),
    trend: buildTrend(vehicles),
    paymentDistribution: buildPaymentDistribution(vehicles),
    outliers: buildOutliers(vehicles),
    stockSnapshot,
    qualityPreview: qualityIssues.slice(0, 8),
    slowestVehicles: [...vehicles]
      .filter((vehicle) => vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0)
      .sort((left, right) => (right.bg_to_delivery ?? 0) - (left.bg_to_delivery ?? 0))
      .slice(0, 10),
    filterOptions: buildFilterOptions(vehicles),
  };
}

const RAW_WORKBOOK_HIDDEN_COLUMNS = new Set([
  "id",
  "import_batch_id",
  "row_number",
  "source_headers",
  "source_values",
  "bg_to_delivery",
  "bg_to_shipment_etd",
  "etd_to_outlet_received",
  "outlet_received_to_reg",
  "reg_to_delivery",
  "etd_to_eta",
  "eta_to_outlet_received",
  "outlet_received_to_delivery",
  "bg_to_disb",
  "delivery_to_disb",
]);

const RAW_WORKBOOK_FIXED_COLUMNS: Array<{
  key: keyof WorkbookExplorerRow | string;
  label: string;
  kind: WorkbookExplorerColumnKind;
  width: string;
  editable?: boolean;
  sticky?: "left" | "right";
  filterable?: boolean;
}> = [
  { key: "chassis_no", label: "Chassis No.", kind: "text", width: "min-w-[160px]", sticky: "left", filterable: true, editable: false },
  { key: "branch_code", label: "Branch", kind: "select", width: "min-w-[120px]", sticky: "left", filterable: true, editable: true },
  { key: "model", label: "Model", kind: "select", width: "min-w-[140px]", sticky: "left", filterable: true, editable: false },
  { key: "payment_method", label: "Payment Method", kind: "select", width: "min-w-[140px]", filterable: true, editable: true },
  { key: "salesman_name", label: "Salesman", kind: "text", width: "min-w-[160px]", filterable: true, editable: true },
  { key: "customer_name", label: "Customer", kind: "text", width: "min-w-[220px]", filterable: true, editable: true },
  { key: "remark", label: "Remark", kind: "text", width: "min-w-[240px]", filterable: true, editable: true },
  { key: "bg_date", label: "BG Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "shipment_etd_pkg", label: "Shipment ETD", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "shipment_eta_kk_twu_sdk", label: "Shipment ETA", kind: "date", width: "min-w-[118px]", filterable: true, editable: false },
  { key: "date_received_by_outlet", label: "Outlet Received", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "reg_date", label: "Registration Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "delivery_date", label: "Delivery Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "disb_date", label: "Disbursement Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: true },
  { key: "is_d2d", label: "D2D", kind: "boolean", width: "min-w-[84px]", filterable: true, editable: false },
  { key: "source_row_no", label: "No.", kind: "text", width: "min-w-[90px]", filterable: true, editable: false },
  { key: "vaa_date", label: "VAA Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: false },
  { key: "full_payment_date", label: "Full Payment Date", kind: "date", width: "min-w-[118px]", filterable: true, editable: false },
  { key: "variant", label: "Variant", kind: "text", width: "min-w-[140px]", filterable: true, editable: false },
  { key: "dealer_transfer_price", label: "Dealer Transfer Price", kind: "text", width: "min-w-[150px]", filterable: true, editable: false },
  { key: "full_payment_type", label: "Full Payment Type", kind: "text", width: "min-w-[150px]", filterable: true, editable: false },
  { key: "shipment_name", label: "Shipment Name", kind: "text", width: "min-w-[180px]", filterable: true, editable: false },
  { key: "lou", label: "LOU", kind: "text", width: "min-w-[120px]", filterable: true, editable: false },
  { key: "contra_sola", label: "Contra Sola", kind: "text", width: "min-w-[120px]", filterable: true, editable: false },
  { key: "reg_no", label: "Reg No.", kind: "text", width: "min-w-[120px]", filterable: true, editable: false },
  { key: "invoice_no", label: "Invoice No.", kind: "text", width: "min-w-[120px]", filterable: true, editable: false },
  { key: "obr", label: "OBR", kind: "text", width: "min-w-[120px]", filterable: true, editable: false },
];

function humanizeWorkbookColumnKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function getWorkbookCellValue(row: WorkbookExplorerRow, key: string) {
  if (key in row) {
    return (row as unknown as Record<string, string | number | boolean | null | undefined>)[key];
  }

  return row.source_values?.[key];
}

function isWorkbookDateValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function inferWorkbookColumnKind(values: Array<string | number | boolean | null | undefined>): WorkbookExplorerColumnKind {
  const seen = values.filter((value) => value !== undefined && value !== null);
  if (seen.length === 0) {
    return "text";
  }

  if (seen.every((value) => typeof value === "boolean")) {
    return "boolean";
  }

  if (seen.every((value) => typeof value === "number")) {
    return "number";
  }

  if (seen.every((value) => isWorkbookDateValue(value))) {
    return "date";
  }

  return "text";
}

export function buildWorkbookExplorerColumns(
  rows: WorkbookExplorerRow[],
  filterOptions: FilterOptions,
): WorkbookExplorerColumn[] {
  const columns: WorkbookExplorerColumn[] = RAW_WORKBOOK_FIXED_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    kind: column.kind,
    width: column.width,
    editable: column.editable,
    sticky: column.sticky,
    filterable: column.filterable,
    options:
      column.key === "branch_code"
        ? filterOptions.branches
        : column.key === "model"
          ? filterOptions.models
          : column.key === "payment_method"
            ? filterOptions.payments
            : undefined,
  }));

  const extraKeys = new Set<string>();
  const extraKeyOrder: string[] = [];
  const extraValues = new Map<string, Array<string | number | boolean | null | undefined>>();

  const addExtraKey = (key: string) => {
    if (RAW_WORKBOOK_HIDDEN_COLUMNS.has(key) || RAW_WORKBOOK_FIXED_COLUMNS.some((column) => column.key === key)) {
      return;
    }
    if (!extraKeys.has(key)) {
      extraKeys.add(key);
      extraKeyOrder.push(key);
    }
  };

  for (const row of rows) {
    const sourceValues = row.source_values ?? {};
    const headers = row.source_headers ?? [];
    for (const header of headers) {
      addExtraKey(header);
    }
    for (const [key, value] of Object.entries(sourceValues)) {
      addExtraKey(key);
      const values = extraValues.get(key) ?? [];
      values.push(value);
      extraValues.set(key, values);
    }
  }

  for (const key of extraKeyOrder) {
    const sampleValues = extraValues.get(key) ?? [];
    columns.push({
      key,
      label: humanizeWorkbookColumnKey(key),
      kind: inferWorkbookColumnKind(sampleValues),
      width: "min-w-[180px]",
      editable: false,
      filterable: true,
    });
  }

  return columns;
}

function toWorkbookColumnKeySet(columns: WorkbookExplorerColumn[]) {
  return new Map(columns.map((column) => [column.key, column]));
}

function normalizeColumnFilterValue(
  value: string | boolean | ExplorerDateRangeFilter | ExplorerNumberRangeFilter | undefined,
): string | boolean | ExplorerDateRangeFilter | ExplorerNumberRangeFilter | undefined {
  if (typeof value === "string") {
    return normalizeTextValue(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (!value) {
    return undefined;
  }

  if ("from" in value || "to" in value) {
    return normalizeDateRange(value as ExplorerDateRangeFilter);
  }

  return normalizeNumberRange(value as ExplorerNumberRangeFilter);
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateRange(range?: ExplorerDateRangeFilter) {
  const from = normalizeTextValue(range?.from);
  const to = normalizeTextValue(range?.to);
  if (!from && !to) {
    return undefined;
  }

  return { from, to };
}

function normalizeNumberRange(range?: ExplorerNumberRangeFilter) {
  const hasMin = typeof range?.min === "number" && Number.isFinite(range.min);
  const hasMax = typeof range?.max === "number" && Number.isFinite(range.max);
  if (!hasMin && !hasMax) {
    return undefined;
  }

  return {
    min: hasMin ? range!.min : undefined,
    max: hasMax ? range!.max : undefined,
  };
}

export function normalizeExplorerFilters(filters?: ExplorerFilterSet): ExplorerFilterSet | undefined {
  if (!filters) {
    return undefined;
  }

  const normalized: ExplorerFilterSet = {};

  const chassisNo = normalizeTextValue(filters.chassisNo);
  if (chassisNo) normalized.chassisNo = chassisNo;

  const salesmanName = normalizeTextValue(filters.salesmanName);
  if (salesmanName) normalized.salesmanName = salesmanName;

  const customerName = normalizeTextValue(filters.customerName);
  if (customerName) normalized.customerName = customerName;

  const remark = normalizeTextValue(filters.remark);
  if (remark) normalized.remark = remark;

  if (typeof filters.isD2D === "boolean") {
    normalized.isD2D = filters.isD2D;
  }

  const bgDate = normalizeDateRange(filters.bgDate);
  if (bgDate) normalized.bgDate = bgDate;

  const shipmentEtdPkg = normalizeDateRange(filters.shipmentEtdPkg);
  if (shipmentEtdPkg) normalized.shipmentEtdPkg = shipmentEtdPkg;

  const dateReceivedByOutlet = normalizeDateRange(filters.dateReceivedByOutlet);
  if (dateReceivedByOutlet) normalized.dateReceivedByOutlet = dateReceivedByOutlet;

  const regDate = normalizeDateRange(filters.regDate);
  if (regDate) normalized.regDate = regDate;

  const deliveryDate = normalizeDateRange(filters.deliveryDate);
  if (deliveryDate) normalized.deliveryDate = deliveryDate;

  const disbDate = normalizeDateRange(filters.disbDate);
  if (disbDate) normalized.disbDate = disbDate;

  const bgToDelivery = normalizeNumberRange(filters.bgToDelivery);
  if (bgToDelivery) normalized.bgToDelivery = bgToDelivery;

  const bgToShipmentEtd = normalizeNumberRange(filters.bgToShipmentEtd);
  if (bgToShipmentEtd) normalized.bgToShipmentEtd = bgToShipmentEtd;

  const etdToOutletReceived = normalizeNumberRange(filters.etdToOutletReceived);
  if (etdToOutletReceived) normalized.etdToOutletReceived = etdToOutletReceived;

  const outletReceivedToReg = normalizeNumberRange(filters.outletReceivedToReg);
  if (outletReceivedToReg) normalized.outletReceivedToReg = outletReceivedToReg;

  const regToDelivery = normalizeNumberRange(filters.regToDelivery);
  if (regToDelivery) normalized.regToDelivery = regToDelivery;

  const bgToDisb = normalizeNumberRange(filters.bgToDisb);
  if (bgToDisb) normalized.bgToDisb = bgToDisb;

  const deliveryToDisb = normalizeNumberRange(filters.deliveryToDisb);
  if (deliveryToDisb) normalized.deliveryToDisb = deliveryToDisb;

  if (filters.columnFilters) {
    const normalizedColumnFilters: ExplorerFilterSet["columnFilters"] = {};
    for (const [key, value] of Object.entries(filters.columnFilters)) {
      const normalizedValue = normalizeColumnFilterValue(value);
      if (normalizedValue !== undefined) {
        normalizedColumnFilters[key] = normalizedValue;
      }
    }

    if (Object.keys(normalizedColumnFilters).length > 0) {
      normalized.columnFilters = normalizedColumnFilters;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeExplorerQuery(query: ExplorerQuery): ExplorerQuery {
  return {
    search: normalizeTextValue(query.search),
    branch: normalizeTextValue(query.branch) ?? "all",
    model: normalizeTextValue(query.model) ?? "all",
    payment: normalizeTextValue(query.payment) ?? "all",
    preset: query.preset,
    filters: normalizeExplorerFilters(query.filters),
    page: Math.max(query.page ?? 1, 1),
    pageSize: Math.min(Math.max(query.pageSize ?? 25, 1), 100),
    sortField: normalizeTextValue(query.sortField) ?? "row_number",
    sortDirection: query.sortDirection ?? "asc",
  };
}

function formatRange(range?: ExplorerDateRangeFilter) {
  if (!range) {
    return "";
  }

  if (range.from && range.to) {
    return `${range.from} → ${range.to}`;
  }
  if (range.from) {
    return `from ${range.from}`;
  }
  if (range.to) {
    return `to ${range.to}`;
  }

  return "";
}

function formatNumberRange(range?: ExplorerNumberRangeFilter) {
  if (!range) {
    return "";
  }

  const min = typeof range.min === "number" ? String(range.min) : "";
  const max = typeof range.max === "number" ? String(range.max) : "";
  if (min && max) {
    return `${min} - ${max}`;
  }
  if (min) {
    return `≥ ${min}`;
  }
  if (max) {
    return `≤ ${max}`;
  }

  return "";
}

function summarizeTextFilter(label: string, value?: string) {
  const normalized = normalizeTextValue(value);
  return normalized ? `${label}: ${normalized}` : undefined;
}

export function listExplorerQueryTokens(query: ExplorerQuery) {
  const normalized = normalizeExplorerQuery(query);
  const filters = normalized.filters;
  const chassisNo = filters?.chassisNo;
  const salesmanName = filters?.salesmanName;
  const customerName = filters?.customerName;
  const remark = filters?.remark;
  const isD2D = filters?.isD2D;
  const bgDate = filters?.bgDate;
  const shipmentEtdPkg = filters?.shipmentEtdPkg;
  const dateReceivedByOutlet = filters?.dateReceivedByOutlet;
  const regDate = filters?.regDate;
  const deliveryDate = filters?.deliveryDate;
  const disbDate = filters?.disbDate;
  const bgToDelivery = filters?.bgToDelivery;
  const bgToShipmentEtd = filters?.bgToShipmentEtd;
  const etdToOutletReceived = filters?.etdToOutletReceived;
  const outletReceivedToReg = filters?.outletReceivedToReg;
  const regToDelivery = filters?.regToDelivery;
  const bgToDisb = filters?.bgToDisb;
  const deliveryToDisb = filters?.deliveryToDisb;
  const columnFilters = filters?.columnFilters ?? {};

  const columnFilterTokens = Object.entries(columnFilters).map(([key, value]) => {
    const label = humanizeWorkbookColumnKey(key);
    if (typeof value === "string") {
      return value ? `${label}: ${value}` : undefined;
    }
    if (typeof value === "boolean") {
      return `${label}: ${value ? "Yes" : "No"}`;
    }
    if (value && "from" in value && "to" in value) {
      const text = formatRange(value as ExplorerDateRangeFilter);
      return text ? `${label}: ${text}` : undefined;
    }
    if (value && "min" in value && "max" in value) {
      const text = formatNumberRange(value as ExplorerNumberRangeFilter);
      return text ? `${label}: ${text}` : undefined;
    }
    return undefined;
  });

  return [
    normalized.search ? `Search: ${normalized.search}` : undefined,
    normalized.branch !== "all" ? `Branch: ${normalized.branch}` : undefined,
    normalized.model !== "all" ? `Model: ${normalized.model}` : undefined,
    normalized.payment !== "all" ? `Payment: ${normalized.payment}` : undefined,
    normalized.preset ? `Preset: ${normalized.preset.replaceAll("_", " ")}` : undefined,
    chassisNo ? `Chassis: ${chassisNo}` : undefined,
    summarizeTextFilter("Salesman", salesmanName),
    summarizeTextFilter("Customer", customerName),
    summarizeTextFilter("Remark", remark),
    typeof isD2D === "boolean" ? `D2D: ${isD2D ? "Yes" : "No"}` : undefined,
    formatRange(bgDate) ? `BG Date: ${formatRange(bgDate)}` : undefined,
    formatRange(shipmentEtdPkg) ? `Shipment ETD: ${formatRange(shipmentEtdPkg)}` : undefined,
    formatRange(dateReceivedByOutlet) ? `Outlet Received: ${formatRange(dateReceivedByOutlet)}` : undefined,
    formatRange(regDate) ? `Registration Date: ${formatRange(regDate)}` : undefined,
    formatRange(deliveryDate) ? `Delivery Date: ${formatRange(deliveryDate)}` : undefined,
    formatRange(disbDate) ? `Disbursement Date: ${formatRange(disbDate)}` : undefined,
    formatNumberRange(bgToDelivery) ? `BG → Delivery: ${formatNumberRange(bgToDelivery)}` : undefined,
    formatNumberRange(bgToShipmentEtd) ? `BG → ETD: ${formatNumberRange(bgToShipmentEtd)}` : undefined,
    formatNumberRange(etdToOutletReceived) ? `ETD → Outlet: ${formatNumberRange(etdToOutletReceived)}` : undefined,
    formatNumberRange(outletReceivedToReg) ? `Outlet → Reg: ${formatNumberRange(outletReceivedToReg)}` : undefined,
    formatNumberRange(regToDelivery) ? `Reg → Delivery: ${formatNumberRange(regToDelivery)}` : undefined,
    formatNumberRange(bgToDisb) ? `BG → Disb: ${formatNumberRange(bgToDisb)}` : undefined,
    formatNumberRange(deliveryToDisb) ? `Delivery → Disb: ${formatNumberRange(deliveryToDisb)}` : undefined,
    ...columnFilterTokens,
  ].filter((token): token is string => Boolean(token));
}

export function describeExplorerQuery(query: ExplorerQuery) {
  const tokens = listExplorerQueryTokens(query);
  return tokens.length > 0 ? tokens.join(" · ") : "All vehicles";
}

export function queryVehicles(
  vehicles: WorkbookExplorerRow[],
  query: ExplorerQuery,
): ExplorerResult {
  const normalized = normalizeExplorerQuery(query);
  const filterOptions = buildFilterOptions(vehicles);
  const columns = buildWorkbookExplorerColumns(vehicles, filterOptions);
  const filtered = filterVehiclesForExplorer(vehicles, normalized, columns);
  const sorted = sortVehiclesForExplorer(filtered, normalized, columns);

  const page = normalized.page;
  const pageSize = normalized.pageSize;
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return {
    items,
    columns,
    total: sorted.length,
    page,
    pageSize,
    filterOptions,
  };
}

export function filterVehiclesForExplorer(
  vehicles: WorkbookExplorerRow[],
  query: Pick<ExplorerQuery, "search" | "branch" | "model" | "payment" | "preset" | "filters">,
  columns: WorkbookExplorerColumn[] = buildWorkbookExplorerColumns(vehicles, buildFilterOptions(vehicles)),
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  const normalized = normalizeExplorerQuery({
    search: query.search,
    branch: query.branch,
    model: query.model,
    payment: query.payment,
    preset: query.preset,
    filters: query.filters,
    page: 1,
    pageSize: 25,
  });
  const columnsByKey = toWorkbookColumnKeySet(columns);

  return vehicles.filter((vehicle) => {
    if (normalized.search && !matchesWorkbookSearchTerm(vehicle, normalized.search)) return false;
    if (normalized.branch !== "all" && vehicle.branch_code !== normalized.branch) return false;
    if (normalized.model !== "all" && vehicle.model !== normalized.model) return false;
    if (normalized.payment !== "all" && vehicle.payment_method !== normalized.payment) return false;
    if (!matchesExplorerPreset(vehicle, normalized.preset, referenceDate)) return false;

    const filters = normalized.filters;
    if (filters?.chassisNo && !vehicle.chassis_no.toLowerCase().includes(filters.chassisNo.toLowerCase())) return false;
    if (filters?.salesmanName && !vehicle.salesman_name.toLowerCase().includes(filters.salesmanName.toLowerCase())) return false;
    if (filters?.customerName && !vehicle.customer_name.toLowerCase().includes(filters.customerName.toLowerCase())) return false;
    if (filters?.remark && !(vehicle.remark ?? "").toLowerCase().includes(filters.remark.toLowerCase())) return false;
    if (typeof filters?.isD2D === "boolean" && vehicle.is_d2d !== filters.isD2D) return false;

    if (filters?.bgDate && !matchesDateRange(vehicle.bg_date, filters.bgDate)) return false;
    if (filters?.shipmentEtdPkg && !matchesDateRange(vehicle.shipment_etd_pkg, filters.shipmentEtdPkg)) return false;
    if (filters?.dateReceivedByOutlet && !matchesDateRange(vehicle.date_received_by_outlet, filters.dateReceivedByOutlet)) return false;
    if (filters?.regDate && !matchesDateRange(vehicle.reg_date, filters.regDate)) return false;
    if (filters?.deliveryDate && !matchesDateRange(vehicle.delivery_date, filters.deliveryDate)) return false;
    if (filters?.disbDate && !matchesDateRange(vehicle.disb_date, filters.disbDate)) return false;

    if (filters?.bgToDelivery && !matchesNumberRange(vehicle.bg_to_delivery, filters.bgToDelivery)) return false;
    if (filters?.bgToShipmentEtd && !matchesNumberRange(vehicle.bg_to_shipment_etd, filters.bgToShipmentEtd)) return false;
    if (filters?.etdToOutletReceived && !matchesNumberRange(vehicle.etd_to_outlet_received, filters.etdToOutletReceived)) return false;
    if (filters?.outletReceivedToReg && !matchesNumberRange(vehicle.outlet_received_to_reg, filters.outletReceivedToReg)) return false;
    if (filters?.regToDelivery && !matchesNumberRange(vehicle.reg_to_delivery, filters.regToDelivery)) return false;
    if (filters?.bgToDisb && !matchesNumberRange(vehicle.bg_to_disb, filters.bgToDisb)) return false;
    if (filters?.deliveryToDisb && !matchesNumberRange(vehicle.delivery_to_disb, filters.deliveryToDisb)) return false;

    for (const [key, value] of Object.entries(filters?.columnFilters ?? {})) {
      const column = columnsByKey.get(key);
      if (!column) {
        continue;
      }

      if (!matchesWorkbookColumnFilter(vehicle, key, column.kind, value)) {
        return false;
      }
    }

    return true;
  });
}

export function sortVehiclesForExplorer(
  vehicles: WorkbookExplorerRow[],
  query: Pick<ExplorerQuery, "sortField" | "sortDirection">,
  columns: WorkbookExplorerColumn[] = buildWorkbookExplorerColumns(vehicles, buildFilterOptions(vehicles)),
) {
  const columnsByKey = toWorkbookColumnKeySet(columns);
  return [...vehicles].sort((left, right) => {
    const field = normalizeTextValue(query.sortField) ?? "row_number";
    const direction = query.sortDirection ?? "asc";
    const column = columnsByKey.get(field);
    const leftRaw = getWorkbookCellValue(left, field) ?? (left as unknown as Record<string, string | number | boolean | null | undefined>)[field];
    const rightRaw = getWorkbookCellValue(right, field) ?? (right as unknown as Record<string, string | number | boolean | null | undefined>)[field];

    const compare = compareWorkbookCellValues(leftRaw, rightRaw, column?.kind);
    return direction === "desc" ? compare * -1 : compare;
  });
}

export function buildVehicleExplorerExportRows(
  vehicles: WorkbookExplorerRow[],
  columns: WorkbookExplorerColumn[] = buildWorkbookExplorerColumns(vehicles, buildFilterOptions(vehicles)),
) {
  return vehicles.map((vehicle) => {
    const row: Record<string, string | number | boolean | null | undefined> = {};
    for (const column of columns) {
      row[column.label] = formatWorkbookCellForExport(getWorkbookCellValue(vehicle, column.key), column.kind);
    }
    return row;
  });
}

function matchesDateRange(value: string | undefined, range: ExplorerDateRangeFilter) {
  if (!value) {
    return false;
  }
  if (range.from && value < range.from) {
    return false;
  }
  if (range.to && value > range.to) {
    return false;
  }
  return true;
}

function matchesNumberRange(value: number | null | undefined, range: ExplorerNumberRangeFilter) {
  if (value == null) {
    return false;
  }
  if (typeof range.min === "number" && value < range.min) {
    return false;
  }
  if (typeof range.max === "number" && value > range.max) {
    return false;
  }
  return true;
}

function matchesWorkbookSearchTerm(vehicle: WorkbookExplorerRow, term: string) {
  const normalizedTerm = term.toLowerCase();
  const values: Array<string | number | boolean | null | undefined> = [
    vehicle.chassis_no,
    vehicle.branch_code,
    vehicle.model,
    vehicle.payment_method,
    vehicle.salesman_name,
    vehicle.customer_name,
    vehicle.remark,
    vehicle.bg_date,
    vehicle.shipment_etd_pkg,
    vehicle.shipment_eta_kk_twu_sdk,
    vehicle.date_received_by_outlet,
    vehicle.reg_date,
    vehicle.delivery_date,
    vehicle.disb_date,
    vehicle.source_row_id,
    vehicle.variant,
    vehicle.dealer_transfer_price,
    vehicle.full_payment_type,
    vehicle.shipment_name,
    vehicle.lou,
    vehicle.contra_sola,
    vehicle.reg_no,
    vehicle.invoice_no,
    vehicle.obr,
    vehicle.is_d2d ? "yes" : "no",
    ...Object.values(vehicle.source_values ?? {}),
  ];

  return values.some((value) => String(value ?? "").toLowerCase().includes(normalizedTerm));
}

function matchesWorkbookColumnFilter(
  vehicle: WorkbookExplorerRow,
  field: string,
  kind: WorkbookExplorerColumnKind,
  filter: string | boolean | ExplorerDateRangeFilter | ExplorerNumberRangeFilter | undefined,
) {
  const value = getWorkbookCellValue(vehicle, field);

  if (typeof filter === "string") {
    if (kind === "select") {
      return String(value ?? "") === filter;
    }
    return String(value ?? "").toLowerCase().includes(filter.toLowerCase());
  }

  if (typeof filter === "boolean") {
    return Boolean(value) === filter;
  }

  if (!filter) {
    return true;
  }

  if ("from" in filter || "to" in filter) {
    return matchesDateRange(typeof value === "string" ? value : undefined, filter as ExplorerDateRangeFilter);
  }

  if ("min" in filter || "max" in filter) {
    const numericValue = typeof value === "number" ? value : Number(value ?? NaN);
    return matchesNumberRange(Number.isFinite(numericValue) ? numericValue : null, filter as ExplorerNumberRangeFilter);
  }

  return true;
}

function compareWorkbookCellValues(
  leftRaw: string | number | boolean | null | undefined,
  rightRaw: string | number | boolean | null | undefined,
  kind?: WorkbookExplorerColumnKind,
) {
  if (kind === "boolean") {
    return Number(Boolean(leftRaw)) - Number(Boolean(rightRaw));
  }

  if (kind === "number") {
    return Number(leftRaw ?? 0) - Number(rightRaw ?? 0);
  }

  if (kind === "date") {
    const leftValue = String(leftRaw ?? "");
    const rightValue = String(rightRaw ?? "");
    return leftValue.localeCompare(rightValue);
  }

  if (kind === "select" || typeof leftRaw === "string" || typeof rightRaw === "string") {
    const leftValue = String(leftRaw ?? "");
    const rightValue = String(rightRaw ?? "");
    return leftValue.localeCompare(rightValue);
  }

  const leftValue = Number(leftRaw ?? 0);
  const rightValue = Number(rightRaw ?? 0);
  return leftValue - rightValue;
}

function formatWorkbookCellForExport(
  value: string | number | boolean | null | undefined,
  kind: WorkbookExplorerColumnKind,
) {
  if (value == null) {
    return "";
  }

  if (kind === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

export function serializeCsvRows(rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0]);
  const sanitizeCsvValue = (value: string) => {
    const trimmed = value.trimStart();
    if (trimmed.length > 0 && /^[=+\-@]/.test(trimmed)) {
      return `'${value}`;
    }
    if (/^[\t\r]/.test(value)) {
      return `'${value}`;
    }
    return value;
  };

  const escapeCell = (value: string | number | boolean | null | undefined) => {
    const text = value == null ? "" : typeof value === "string" ? sanitizeCsvValue(value) : String(value);
    if (!/[",\n\r]/.test(text)) {
      return text;
    }
    return `"${text.replaceAll('"', '""')}"`;
  };

  const lines = [
    columns.map((column) => escapeCell(column)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}
