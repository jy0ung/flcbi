import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  EXECUTIVE_DASHBOARD_METRIC_OPTIONS,
  EXPLORER_PRESET_LABELS,
  KPI_DEFINITIONS,
  MAX_EXECUTIVE_DASHBOARD_METRICS,
  normalizeExecutiveDashboardMetricIds,
} from '@flcbi/contracts';
import type { ExecutiveDashboardMetricId, ExplorerPreset, VehicleCanonical } from '@flcbi/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, CheckCircle, Package, ReceiptText, Store, Timer, TrendingUp, Truck, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  useAgingSummary,
  useExecutiveDashboardPreferences,
  useUpdateExecutiveDashboardPreferences,
} from '@/hooks/api/use-platform';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type MetricCard = {
  id: ExecutiveDashboardMetricId;
  label: string;
  value: number;
  subtitle: string;
  tone: string;
  icon: LucideIcon;
  onClick: () => void;
};

function toKpiMetricId(kpiId: string): ExecutiveDashboardMetricId | null {
  switch (kpiId) {
    case 'bg_to_delivery':
      return 'bg_to_delivery_median';
    case 'bg_to_shipment_etd':
      return 'bg_to_shipment_etd_median';
    case 'etd_to_outlet':
      return 'etd_to_outlet_median';
    case 'outlet_to_reg':
      return 'outlet_to_reg_median';
    case 'reg_to_delivery':
      return 'reg_to_delivery_median';
    case 'bg_to_disb':
      return 'bg_to_disb_median';
    case 'delivery_to_disb':
      return 'delivery_to_disb_median';
    default:
      return null;
  }
}

const presetOptions: Array<{ value: ExplorerPreset; label: string }> = Object.entries(EXPLORER_PRESET_LABELS).map(
  ([value, label]) => ({ value: value as ExplorerPreset, label }),
);

export default function ExecutiveDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const branchFilter = searchParams.get('branch') ?? 'all';
  const modelFilter = searchParams.get('model') ?? 'all';
  const paymentFilter = searchParams.get('payment') ?? 'all';
  const presetFilter = (searchParams.get('preset') as ExplorerPreset | null) ?? undefined;
  const summaryQuery = useAgingSummary({
    branch: branchFilter,
    model: modelFilter,
    payment: paymentFilter,
    preset: presetFilter,
  });
  const preferencesQuery = useExecutiveDashboardPreferences();
  const updatePreferences = useUpdateExecutiveDashboardPreferences();
  const summary = summaryQuery.data?.summary;
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [draftMetricIds, setDraftMetricIds] = useState<ExecutiveDashboardMetricId[]>([]);
  const chartColors = ['hsl(0, 72%, 51%)', 'hsl(38, 92%, 50%)', 'hsl(38, 92%, 50%)', 'hsl(43, 96%, 56%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)'];

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters =
    branchFilter !== 'all' || modelFilter !== 'all' || paymentFilter !== 'all' || Boolean(presetFilter);

  const navigateToExplorer = ({
    preset,
    sortField,
    sortDirection,
  }: {
    preset?: ExplorerPreset;
    sortField?: keyof VehicleCanonical;
    sortDirection?: 'asc' | 'desc';
  }) => {
    const params = new URLSearchParams();
    const finalPreset = preset ?? presetFilter;

    if (finalPreset) params.set('preset', finalPreset);
    if (branchFilter !== 'all') params.set('branch', branchFilter);
    if (modelFilter !== 'all') params.set('model', modelFilter);
    if (paymentFilter !== 'all') params.set('payment', paymentFilter);
    if (sortField) params.set('sortField', sortField);
    if (sortDirection) params.set('sortDirection', sortDirection);
    navigate(`/auto-aging/vehicles${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  const kpiSortFieldById = useMemo(() => Object.fromEntries(
    KPI_DEFINITIONS.map((kpi) => [kpi.id, kpi.computedField]),
  ) as Record<string, keyof VehicleCanonical>, []);
  const selectedMetricIds = useMemo(
    () => normalizeExecutiveDashboardMetricIds(preferencesQuery.data?.preferences.executiveMetricIds),
    [preferencesQuery.data?.preferences.executiveMetricIds],
  );

  useEffect(() => {
    setDraftMetricIds(selectedMetricIds);
  }, [selectedMetricIds]);

  const metricGroups = useMemo(() => {
    const groups = new Map<string, typeof EXECUTIVE_DASHBOARD_METRIC_OPTIONS>();
    EXECUTIVE_DASHBOARD_METRIC_OPTIONS.forEach((metric) => {
      const items = groups.get(metric.group) ?? [];
      items.push(metric);
      groups.set(metric.group, items);
    });
    return groups;
  }, []);

  const toggleDraftMetric = (metricId: ExecutiveDashboardMetricId) => {
    setDraftMetricIds((current) => {
      if (current.includes(metricId)) {
        return current.filter((item) => item !== metricId);
      }
      if (current.length >= MAX_EXECUTIVE_DASHBOARD_METRICS) {
        return current;
      }
      return [...current, metricId];
    });
  };

  const saveMetricPreferences = async () => {
    await updatePreferences.mutateAsync(draftMetricIds);
    setIsCustomizeOpen(false);
  };

  if (summaryQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading executive dashboard...</div>;
  }

  if (summaryQuery.isError || !summary) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
          description="FLC Business Intelligence — Executive Overview"
        />
        <QueryErrorState
          title="Could not load executive dashboard"
          error={summaryQuery.error}
          onRetry={() => void summaryQuery.refetch()}
        />
      </div>
    );
  }

  const lastBatch = summary.latestImport;
  const selectedMetricSet = new Set(selectedMetricIds);
  const kpiById = new Map(summary.kpiSummaries.map((kpi) => [kpi.kpiId, kpi]));
  const filterScopeLabel = [
    presetFilter ? EXPLORER_PRESET_LABELS[presetFilter] : null,
    branchFilter !== 'all' ? branchFilter : null,
    modelFilter !== 'all' ? modelFilter : null,
    paymentFilter !== 'all' ? paymentFilter : null,
  ].filter(Boolean).join(' • ');

  const metricCardMap = new Map<ExecutiveDashboardMetricId, MetricCard>();
  const buildKpiMetric = (
    id: ExecutiveDashboardMetricId,
    kpiId: string,
    tone: string,
  ): MetricCard => {
    const kpi = kpiById.get(kpiId);
    return {
      id,
      label: kpi?.shortLabel ?? kpiId,
      value: kpi?.median ?? 0,
      subtitle: `Median days • ${kpi?.overdueCount ?? 0} breaches`,
      tone,
      icon: Timer,
      onClick: () => navigateToExplorer({
        sortField: kpiSortFieldById[kpiId],
        sortDirection: 'desc',
      }),
    };
  };

  metricCardMap.set('open_stock', {
    id: 'open_stock',
    label: 'Open Stock',
    value: summary.stockSnapshot.openStock,
    subtitle: 'Units not yet delivered',
    tone: 'text-primary',
    icon: Package,
    onClick: () => navigateToExplorer({ preset: 'open_stock', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('pending_shipment', {
    id: 'pending_shipment',
    label: 'Pending Shipment',
    value: summary.stockSnapshot.pendingShipment,
    subtitle: 'Open units with no ETD yet',
    tone: 'text-warning',
    icon: Package,
    onClick: () => navigateToExplorer({ preset: 'pending_shipment', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('in_transit', {
    id: 'in_transit',
    label: 'In Transit',
    value: summary.stockSnapshot.inTransit,
    subtitle: 'Shipped but not yet received',
    tone: 'text-info',
    icon: Truck,
    onClick: () => navigateToExplorer({ preset: 'in_transit', sortField: 'shipment_etd_pkg', sortDirection: 'asc' }),
  });
  metricCardMap.set('at_outlet', {
    id: 'at_outlet',
    label: 'At Outlet',
    value: summary.stockSnapshot.atOutlet,
    subtitle: 'Received by outlet, pending registration',
    tone: 'text-warning',
    icon: Store,
    onClick: () => navigateToExplorer({ preset: 'at_outlet', sortField: 'date_received_by_outlet', sortDirection: 'asc' }),
  });
  metricCardMap.set('registered_pending_delivery', {
    id: 'registered_pending_delivery',
    label: 'Registered Pending Delivery',
    value: summary.stockSnapshot.registeredPendingDelivery,
    subtitle: 'Registered units waiting for delivery',
    tone: 'text-warning',
    icon: ReceiptText,
    onClick: () => navigateToExplorer({ preset: 'registered_pending_delivery', sortField: 'reg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('pending_disbursement', {
    id: 'pending_disbursement',
    label: 'Pending Disbursement',
    value: summary.stockSnapshot.deliveredPendingDisbursement,
    subtitle: 'Delivered units awaiting disbursement',
    tone: 'text-success',
    icon: Wallet,
    onClick: () => navigateToExplorer({ preset: 'pending_disbursement', sortField: 'delivery_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('disbursed', {
    id: 'disbursed',
    label: 'Disbursed',
    value: summary.stockSnapshot.disbursed,
    subtitle: 'Units already disbursed',
    tone: 'text-success',
    icon: CheckCircle,
    onClick: () => navigateToExplorer({ preset: 'disbursed', sortField: 'disb_date', sortDirection: 'desc' }),
  });
  metricCardMap.set('tracked_units', {
    id: 'tracked_units',
    label: 'Tracked Units',
    value: summary.totalVehicles,
    subtitle: 'Vehicles in the current dashboard scope',
    tone: 'text-foreground',
    icon: Timer,
    onClick: () => navigateToExplorer({ sortField: 'bg_date', sortDirection: 'desc' }),
  });
  metricCardMap.set('import_batches', {
    id: 'import_batches',
    label: 'Import Batches',
    value: summary.importCount,
    subtitle: 'Retained in import history',
    tone: 'text-info',
    icon: TrendingUp,
    onClick: () => navigate('/auto-aging/history'),
  });
  metricCardMap.set('sla_breaches', {
    id: 'sla_breaches',
    label: 'SLA Breaches',
    value: summary.totalOverdue,
    subtitle: 'Overdue KPI measurements',
    tone: 'text-warning',
    icon: AlertTriangle,
    onClick: () => navigate('/auto-aging'),
  });
  metricCardMap.set('quality_issues', {
    id: 'quality_issues',
    label: 'Quality Issues',
    value: summary.totalIssues,
    subtitle: 'Current data quality findings',
    tone: 'text-destructive',
    icon: CheckCircle,
    onClick: () => navigate('/auto-aging/quality'),
  });
  metricCardMap.set('aged_30_plus', {
    id: 'aged_30_plus',
    label: '30+ Days Open',
    value: summary.stockSnapshot.aged30Plus,
    subtitle: 'Open units older than 30 days',
    tone: 'text-warning',
    icon: AlertTriangle,
    onClick: () => navigateToExplorer({ preset: 'aged_30_plus', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('aged_60_plus', {
    id: 'aged_60_plus',
    label: '60+ Days Open',
    value: summary.stockSnapshot.aged60Plus,
    subtitle: 'Open units older than 60 days',
    tone: 'text-warning',
    icon: AlertTriangle,
    onClick: () => navigateToExplorer({ preset: 'aged_60_plus', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('aged_90_plus', {
    id: 'aged_90_plus',
    label: '90+ Days Open',
    value: summary.stockSnapshot.aged90Plus,
    subtitle: 'Open units older than 90 days',
    tone: 'text-destructive',
    icon: AlertTriangle,
    onClick: () => navigateToExplorer({ preset: 'aged_90_plus', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('d2d_open', {
    id: 'd2d_open',
    label: 'Open D2D',
    value: summary.stockSnapshot.d2dOpenTransfers,
    subtitle: 'D2D or transfer units still open',
    tone: 'text-warning',
    icon: Truck,
    onClick: () => navigateToExplorer({ preset: 'd2d_open', sortField: 'bg_date', sortDirection: 'asc' }),
  });
  metricCardMap.set('bg_to_delivery_median', buildKpiMetric('bg_to_delivery_median', 'bg_to_delivery', 'text-foreground'));
  metricCardMap.set('bg_to_shipment_etd_median', buildKpiMetric('bg_to_shipment_etd_median', 'bg_to_shipment_etd', 'text-info'));
  metricCardMap.set('etd_to_outlet_median', buildKpiMetric('etd_to_outlet_median', 'etd_to_outlet', 'text-info'));
  metricCardMap.set('outlet_to_reg_median', buildKpiMetric('outlet_to_reg_median', 'outlet_to_reg', 'text-warning'));
  metricCardMap.set('reg_to_delivery_median', buildKpiMetric('reg_to_delivery_median', 'reg_to_delivery', 'text-warning'));
  metricCardMap.set('bg_to_disb_median', buildKpiMetric('bg_to_disb_median', 'bg_to_disb', 'text-success'));
  metricCardMap.set('delivery_to_disb_median', buildKpiMetric('delivery_to_disb_median', 'delivery_to_disb', 'text-success'));

  const selectedMetricCards = selectedMetricIds
    .map((metricId) => metricCardMap.get(metricId))
    .filter((metric): metric is MetricCard => Boolean(metric));

  const flowCards = [
    { metricId: 'pending_shipment' as const, label: 'Pending Shipment', value: summary.stockSnapshot.pendingShipment, onClick: () => navigateToExplorer({ preset: 'pending_shipment', sortField: 'bg_date', sortDirection: 'asc' }) },
    { metricId: 'in_transit' as const, label: 'In Transit', value: summary.stockSnapshot.inTransit, onClick: () => navigateToExplorer({ preset: 'in_transit', sortField: 'shipment_etd_pkg', sortDirection: 'asc' }) },
    { metricId: 'at_outlet' as const, label: 'At Outlet', value: summary.stockSnapshot.atOutlet, onClick: () => navigateToExplorer({ preset: 'at_outlet', sortField: 'date_received_by_outlet', sortDirection: 'asc' }) },
    { metricId: 'registered_pending_delivery' as const, label: 'Registered Pending Delivery', value: summary.stockSnapshot.registeredPendingDelivery, onClick: () => navigateToExplorer({ preset: 'registered_pending_delivery', sortField: 'reg_date', sortDirection: 'asc' }) },
    { metricId: 'pending_disbursement' as const, label: 'Delivered Pending Disbursement', value: summary.stockSnapshot.deliveredPendingDisbursement, onClick: () => navigateToExplorer({ preset: 'pending_disbursement', sortField: 'delivery_date', sortDirection: 'asc' }) },
  ].filter((card) => !selectedMetricSet.has(card.metricId));

  const riskCards = [
    { metricId: 'aged_30_plus' as const, label: '30+ Days Open', value: summary.stockSnapshot.aged30Plus, onClick: () => navigateToExplorer({ preset: 'aged_30_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { metricId: 'aged_60_plus' as const, label: '60+ Days Open', value: summary.stockSnapshot.aged60Plus, onClick: () => navigateToExplorer({ preset: 'aged_60_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { metricId: 'aged_90_plus' as const, label: '90+ Days Open', value: summary.stockSnapshot.aged90Plus, onClick: () => navigateToExplorer({ preset: 'aged_90_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { metricId: 'd2d_open' as const, label: 'Open D2D', value: summary.stockSnapshot.d2dOpenTransfers, onClick: () => navigateToExplorer({ preset: 'd2d_open', sortField: 'bg_date', sortDirection: 'asc' }) },
  ].filter((card) => !selectedMetricSet.has(card.metricId));

  const focusKpis = [...summary.kpiSummaries]
    .sort((left, right) => right.overdueCount - left.overdueCount || right.median - left.median)
    .filter((kpi) => {
      const metricId = toKpiMetricId(kpi.kpiId);
      return metricId ? !selectedMetricSet.has(metricId) : true;
    })
    .slice(0, 4);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        description={
          filterScopeLabel
            ? `Executive Overview scoped to ${filterScopeLabel}`
            : 'FLC Business Intelligence — Executive Overview'
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(summary.lastRefresh).toLocaleString()}</p>
            </div>
            {lastBatch && (
              <div className="px-3 py-1.5 rounded-md bg-success/10 border border-success/20">
                <p className="text-[10px] text-success font-medium">Latest: {lastBatch.fileName}</p>
              </div>
            )}
          </div>
        }
      />

      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <select
          data-testid="executive-filter-preset"
          value={presetFilter ?? 'all'}
          onChange={(event) => updateParams({ preset: event.target.value === 'all' ? undefined : event.target.value })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Pipeline States</option>
          {presetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          data-testid="executive-filter-branch"
          value={branchFilter}
          onChange={(event) => updateParams({ branch: event.target.value })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Branches</option>
          {summary.filterOptions.branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
        </select>
        <select
          data-testid="executive-filter-model"
          value={modelFilter}
          onChange={(event) => updateParams({ model: event.target.value })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Models</option>
          {summary.filterOptions.models.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
        <select
          data-testid="executive-filter-payment"
          value={paymentFilter}
          onChange={(event) => updateParams({ payment: event.target.value })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Payments</option>
          {summary.filterOptions.payments.map((payment) => <option key={payment} value={payment}>{payment}</option>)}
        </select>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </div>

      <div className="space-y-2" data-testid="executive-metric-board">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">My KPI Board</h2>
            <p className="text-xs text-muted-foreground">
              Pin up to {MAX_EXECUTIVE_DASHBOARD_METRICS} metrics. Anything pinned here is hidden from the watchlists below to avoid duplicate numbers.
            </p>
          </div>
          <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="executive-customize-button">Customize Board</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Customize My KPI Board</DialogTitle>
                <DialogDescription>
                  Choose the KPIs you want pinned at the top. This creates a personal KPI board without duplicating the same cards across the rest of the dashboard.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {Array.from(metricGroups.entries()).map(([group, metrics]) => (
                  <div key={group} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      {metrics.map((metric) => {
                        const checked = draftMetricIds.includes(metric.id);
                        const disableCheck = !checked && draftMetricIds.length >= MAX_EXECUTIVE_DASHBOARD_METRICS;
                        return (
                          <label
                            key={metric.id}
                            data-testid={`executive-metric-option-${metric.id}`}
                            className={`rounded-lg border p-3 transition-colors ${
                              checked ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20'
                            } ${disableCheck ? 'opacity-50' : 'cursor-pointer hover:border-primary/40'}`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleDraftMetric(metric.id)}
                                disabled={disableCheck}
                              />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{metric.label}</p>
                                <p className="text-xs text-muted-foreground">{metric.description}</p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDraftMetricIds(normalizeExecutiveDashboardMetricIds())}
                >
                  Reset to Recommended
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {draftMetricIds.length} / {MAX_EXECUTIVE_DASHBOARD_METRICS} selected
                  </span>
                  <Button
                    type="button"
                    onClick={() => void saveMetricPreferences()}
                    disabled={draftMetricIds.length === 0 || updatePreferences.isPending}
                  >
                    {updatePreferences.isPending ? 'Saving...' : 'Save Board'}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="executive-metric-grid">
          {selectedMetricCards.map((card) => (
            <button
              key={card.id}
              type="button"
              data-testid={`executive-metric-card-${card.id}`}
              className="kpi-card text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={card.onClick}
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`h-4 w-4 ${card.tone}`} />
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{card.subtitle}</p>
            </button>
          ))}
        </div>

        {preferencesQuery.isFetching && (
          <p className="text-xs text-muted-foreground">Refreshing saved KPI board...</p>
        )}
        {updatePreferences.isError && (
          <p className="text-xs text-destructive">Could not save your KPI board yet.</p>
        )}
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="glass-panel p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-foreground mb-1">Stock Flow Watchlist</h3>
            <p className="text-xs text-muted-foreground">A compact view of where open units are currently sitting, excluding anything already pinned above.</p>
          </div>

          {flowCards.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {flowCards.map((card) => {
                const denominator = Math.max(summary.stockSnapshot.openStock, 1);
                const width = Math.min(100, Math.round((card.value / denominator) * 100));
                return (
                  <button
                    key={card.label}
                    type="button"
                    className="rounded-lg border border-border bg-secondary/20 p-4 text-left transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    onClick={card.onClick}
                  >
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <p className="text-2xl font-semibold text-foreground mt-1">{card.value}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{width}% of open stock</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-secondary">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Your KPI board already covers the current stock-flow highlights.</p>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Stock Aging Risk</h4>
                <p className="text-xs text-muted-foreground">Open stock that needs attention before it becomes stale.</p>
              </div>
            </div>
            {riskCards.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {riskCards.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    className="rounded-lg border border-border bg-secondary/20 p-4 text-left transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    onClick={card.onClick}
                  >
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="text-xl font-semibold text-foreground mt-2">{card.value}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">All aging-risk cards are already pinned on your KPI board.</p>
            )}
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-1">Branch Comparison</h3>
          <p className="text-xs text-muted-foreground mb-4">Average BG to Delivery days by branch for the current scope</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.branchComparison.map((item) => ({ branch: item.branch, avg: item.bgToDelivery }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(222, 44%, 10%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210, 20%, 92%)' }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {summary.branchComparison.map((_, index) => (
                  <Cell key={index} fill={chartColors[Math.min(index, chartColors.length - 1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-6 cursor-pointer hover:border-primary/30 transition-all" onClick={() => navigate('/auto-aging')}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Auto Aging</h3>
              <p className="text-xs text-muted-foreground">Vehicle aging and milestone analysis</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {summary.kpiSummaries.slice(0, 3).map((kpi) => (
              <div key={kpi.kpiId} className="p-2 rounded bg-secondary/50">
                <p className="text-[10px] text-muted-foreground truncate">{kpi.shortLabel}</p>
                <p className="text-lg font-bold text-foreground">{kpi.median}<span className="text-xs text-muted-foreground ml-0.5">d</span></p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-1">KPI Watchlist</h3>
          <p className="text-xs text-muted-foreground mb-4">The KPI lanes contributing the most current operational risk, excluding anything already pinned above.</p>
          {focusKpis.length > 0 ? (
            <div className="space-y-3">
              {focusKpis.map((kpi) => (
                <button
                  key={kpi.kpiId}
                  type="button"
                  className="w-full rounded-lg border border-border bg-secondary/20 p-4 text-left transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => navigateToExplorer({
                    sortField: kpiSortFieldById[kpi.kpiId] ?? 'bg_to_delivery',
                    sortDirection: 'desc',
                  })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{kpi.shortLabel}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Median {kpi.median} days against a {kpi.slaDays}-day SLA
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-warning">{kpi.overdueCount}</p>
                      <p className="text-[11px] text-muted-foreground">breaches</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Your KPI board already covers the current top KPI bottlenecks.</p>
          )}
        </div>
      </div>
    </div>
  );
}
