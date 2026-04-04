import type {
  AgingSummary,
  BranchComparison,
  DataQualityIssue,
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
  { label: "Aging Dashboard", path: "/auto-aging", icon: "Timer", section: "Auto Aging" },
  { label: "Vehicle Explorer", path: "/auto-aging/vehicles", icon: "Car", section: "Auto Aging" },
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
  const groups = new Map<string, { bgToDelivery: number[]; etdToEta: number[]; outletToDelivery: number[] }>();
  vehicles.forEach((vehicle) => {
    const entry = groups.get(vehicle.branch_code) ?? { bgToDelivery: [], etdToEta: [], outletToDelivery: [] };
    if (vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0) entry.bgToDelivery.push(vehicle.bg_to_delivery);
    if (vehicle.etd_to_eta != null && vehicle.etd_to_eta >= 0) entry.etdToEta.push(vehicle.etd_to_eta);
    if (vehicle.outlet_received_to_delivery != null && vehicle.outlet_received_to_delivery >= 0) {
      entry.outletToDelivery.push(vehicle.outlet_received_to_delivery);
    }
    groups.set(vehicle.branch_code, entry);
  });

  const average = (values: number[]) =>
    values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return [...groups.entries()]
    .map(([branch, values]) => ({
      branch,
      bgToDelivery: average(values.bgToDelivery),
      etdToEta: average(values.etdToEta),
      outletToDelivery: average(values.outletToDelivery),
    }))
    .sort((left, right) => right.bgToDelivery - left.bgToDelivery);
}

export function buildTrend(vehicles: VehicleCanonical[]): TrendPoint[] {
  const monthMap = new Map<string, { bgToDel: number[]; etdToEta: number[]; outletToDel: number[] }>();
  vehicles.forEach((vehicle) => {
    if (!vehicle.bg_date) return;
    const month = vehicle.bg_date.slice(0, 7);
    const entry = monthMap.get(month) ?? { bgToDel: [], etdToEta: [], outletToDel: [] };
    if (vehicle.bg_to_delivery != null && vehicle.bg_to_delivery >= 0) entry.bgToDel.push(vehicle.bg_to_delivery);
    if (vehicle.etd_to_eta != null && vehicle.etd_to_eta >= 0) entry.etdToEta.push(vehicle.etd_to_eta);
    if (vehicle.outlet_received_to_delivery != null && vehicle.outlet_received_to_delivery >= 0) {
      entry.outletToDel.push(vehicle.outlet_received_to_delivery);
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
      "ETD→ETA": average(values.etdToEta),
      "Outlet→Delivery": average(values.outletToDel),
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
        vehicle.etd_to_eta != null &&
        vehicle.etd_to_eta >= 0,
    )
    .map((vehicle) => ({
      chassisNo: vehicle.chassis_no,
      branch: vehicle.branch_code,
      bgToDelivery: vehicle.bg_to_delivery as number,
      etdToEta: vehicle.etd_to_eta as number,
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
    atOutlet: openVehicles.filter((vehicle) => Boolean(vehicle.date_received_by_outlet)).length,
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
  const filtered = vehicles
    .filter((vehicle) => {
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
      return true;
    })
    .sort((left, right) => {
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
