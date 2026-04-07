import type {
  AgingSummary,
  BranchComparison,
  DashboardPreferences,
  DataQualityIssue,
  ExecutiveDashboardMetricId,
  ExplorerPreset,
  ExplorerQuery,
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
  { label: "Mappings", path: "/auto-aging/mappings", icon: "Map", section: "Auto Aging" },
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

export function queryVehicles(
  vehicles: VehicleCanonical[],
  query: ExplorerQuery,
): ExplorerResult {
  const filtered = sortVehiclesForExplorer(filterVehiclesForExplorer(vehicles, query), query);

  const page = Math.max(query.page, 1);
  const pageSize = Math.min(Math.max(query.pageSize, 1), 100);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    filterOptions: buildFilterOptions(vehicles),
  };
}

export function filterVehiclesForExplorer(
  vehicles: VehicleCanonical[],
  query: Pick<ExplorerQuery, "search" | "branch" | "model" | "payment" | "preset">,
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  return vehicles.filter((vehicle) => {
    if (query.search) {
      const term = query.search.toLowerCase();
      const matchesSearch =
        vehicle.chassis_no.toLowerCase().includes(term) ||
        vehicle.customer_name.toLowerCase().includes(term) ||
        vehicle.salesman_name.toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }
    if (query.branch && query.branch !== "all" && vehicle.branch_code !== query.branch) return false;
    if (query.model && query.model !== "all" && vehicle.model !== query.model) return false;
    if (query.payment && query.payment !== "all" && vehicle.payment_method !== query.payment) return false;
    if (!matchesExplorerPreset(vehicle, query.preset, referenceDate)) return false;
    return true;
  });
}

export function sortVehiclesForExplorer(
  vehicles: VehicleCanonical[],
  query: Pick<ExplorerQuery, "sortField" | "sortDirection">,
) {
  return [...vehicles].sort((left, right) => {
    const field = query.sortField ?? "bg_to_delivery";
    const direction = query.sortDirection ?? "desc";
    const leftValue = (left[field] as number | string | null | undefined) ?? 0;
    const rightValue = (right[field] as number | string | null | undefined) ?? 0;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return direction === "desc"
        ? rightValue.localeCompare(leftValue)
        : leftValue.localeCompare(rightValue);
    }
    return direction === "desc"
      ? Number(rightValue) - Number(leftValue)
      : Number(leftValue) - Number(rightValue);
  });
}

export function buildVehicleExplorerExportRows(vehicles: VehicleCanonical[]) {
  return vehicles.map((vehicle) => ({
    "Chassis No": vehicle.chassis_no,
    Branch: vehicle.branch_code,
    Model: vehicle.model,
    "Payment Method": vehicle.payment_method,
    Salesman: vehicle.salesman_name,
    Customer: vehicle.customer_name,
    D2D: vehicle.is_d2d ? "Yes" : "No",
    "BG Date": vehicle.bg_date ?? "",
    "Shipment ETD": vehicle.shipment_etd_pkg ?? "",
    "Shipment ETA": vehicle.shipment_eta_kk_twu_sdk ?? "",
    "Outlet Received Date": vehicle.date_received_by_outlet ?? "",
    "Registration Date": vehicle.reg_date ?? "",
    "Delivery Date": vehicle.delivery_date ?? "",
    "Disbursement Date": vehicle.disb_date ?? "",
    "BG to Delivery": vehicle.bg_to_delivery ?? "",
    "BG to Shipment ETD": vehicle.bg_to_shipment_etd ?? "",
    "ETD to Outlet Received": vehicle.etd_to_outlet_received ?? "",
    "Outlet Received to Registration": vehicle.outlet_received_to_reg ?? "",
    "Registration to Delivery": vehicle.reg_to_delivery ?? "",
    "ETD to ETA": vehicle.etd_to_eta ?? "",
    "ETA to Outlet Received": vehicle.eta_to_outlet_received ?? "",
    "Outlet Received to Delivery": vehicle.outlet_received_to_delivery ?? "",
    "BG to Disbursement": vehicle.bg_to_disb ?? "",
    "Delivery to Disbursement": vehicle.delivery_to_disb ?? "",
  }));
}

export function serializeCsvRows(rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0]);
  const escapeCell = (value: string | number | boolean | null | undefined) => {
    const text = value == null ? "" : String(value);
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
