import React from 'react';
import { useNavigate } from 'react-router-dom';
import { KPI_DEFINITIONS } from '@flcbi/contracts';
import type { ExplorerPreset, VehicleCanonical } from '@flcbi/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, CheckCircle, Package, ReceiptText, Store, Timer, TrendingUp, Truck, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAgingSummary } from '@/hooks/api/use-platform';

export default function ExecutiveDashboard() {
  const { data, error, isError, isLoading, refetch } = useAgingSummary();
  const { user } = useAuth();
  const navigate = useNavigate();
  const summary = data?.summary;
  const chartColors = ['hsl(0, 72%, 51%)', 'hsl(38, 92%, 50%)', 'hsl(38, 92%, 50%)', 'hsl(43, 96%, 56%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)'];

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
    if (preset) params.set('preset', preset);
    if (sortField) params.set('sortField', sortField);
    if (sortDirection) params.set('sortDirection', sortDirection);
    navigate(`/auto-aging/vehicles${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading executive dashboard...</div>;
  }

  if (isError || !summary) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
          description="FLC Business Intelligence — Executive Overview"
        />
        <QueryErrorState
          title="Could not load executive dashboard"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const lastBatch = summary.latestImport;
  const kpiSortFieldById = Object.fromEntries(
    KPI_DEFINITIONS.map((kpi) => [kpi.id, kpi.computedField]),
  ) as Record<string, keyof VehicleCanonical>;
  const stockCards = [
    { label: 'Open Stock', value: summary.stockSnapshot.openStock, icon: Package, tone: 'text-primary', onClick: () => navigateToExplorer({ preset: 'open_stock', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: 'In Transit', value: summary.stockSnapshot.inTransit, icon: Truck, tone: 'text-info', onClick: () => navigateToExplorer({ preset: 'in_transit', sortField: 'shipment_etd_pkg', sortDirection: 'asc' }) },
    { label: 'Registered Pending Delivery', value: summary.stockSnapshot.registeredPendingDelivery, icon: ReceiptText, tone: 'text-warning', onClick: () => navigateToExplorer({ preset: 'registered_pending_delivery', sortField: 'reg_date', sortDirection: 'asc' }) },
    { label: 'Pending Disbursement', value: summary.stockSnapshot.deliveredPendingDisbursement, icon: Wallet, tone: 'text-success', onClick: () => navigateToExplorer({ preset: 'pending_disbursement', sortField: 'delivery_date', sortDirection: 'asc' }) },
  ] as const;
  const supportCards = [
    { label: 'Tracked Units', value: summary.totalVehicles, icon: Timer, tone: 'text-foreground', onClick: () => navigate('/auto-aging/vehicles') },
    { label: 'Import Batches', value: summary.importCount, icon: TrendingUp, tone: 'text-info', onClick: () => navigate('/auto-aging/history') },
    { label: 'SLA Breaches', value: summary.totalOverdue, icon: AlertTriangle, tone: 'text-warning', onClick: () => navigate('/auto-aging') },
    { label: 'Quality Issues', value: summary.totalIssues, icon: CheckCircle, tone: 'text-destructive', onClick: () => navigate('/auto-aging/quality') },
  ] as const;
  const riskCards = [
    { label: '30+ Days Open', value: summary.stockSnapshot.aged30Plus, onClick: () => navigateToExplorer({ preset: 'aged_30_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: '60+ Days Open', value: summary.stockSnapshot.aged60Plus, onClick: () => navigateToExplorer({ preset: 'aged_60_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: '90+ Days Open', value: summary.stockSnapshot.aged90Plus, onClick: () => navigateToExplorer({ preset: 'aged_90_plus', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: 'Open D2D', value: summary.stockSnapshot.d2dOpenTransfers, onClick: () => navigateToExplorer({ preset: 'd2d_open', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: 'Pending Shipment', value: summary.stockSnapshot.pendingShipment, onClick: () => navigateToExplorer({ preset: 'pending_shipment', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: 'Disbursed', value: summary.stockSnapshot.disbursed, onClick: () => navigateToExplorer({ preset: 'disbursed', sortField: 'disb_date', sortDirection: 'desc' }) },
  ] as const;
  const flowCards = [
    { label: 'Pending Shipment', value: summary.stockSnapshot.pendingShipment, onClick: () => navigateToExplorer({ preset: 'pending_shipment', sortField: 'bg_date', sortDirection: 'asc' }) },
    { label: 'In Transit', value: summary.stockSnapshot.inTransit, onClick: () => navigateToExplorer({ preset: 'in_transit', sortField: 'shipment_etd_pkg', sortDirection: 'asc' }) },
    { label: 'At Outlet', value: summary.stockSnapshot.atOutlet, onClick: () => navigateToExplorer({ preset: 'at_outlet', sortField: 'date_received_by_outlet', sortDirection: 'asc' }) },
    { label: 'Registered Pending Delivery', value: summary.stockSnapshot.registeredPendingDelivery, onClick: () => navigateToExplorer({ preset: 'registered_pending_delivery', sortField: 'reg_date', sortDirection: 'asc' }) },
    { label: 'Delivered Pending Disbursement', value: summary.stockSnapshot.deliveredPendingDisbursement, onClick: () => navigateToExplorer({ preset: 'pending_disbursement', sortField: 'delivery_date', sortDirection: 'asc' }) },
  ] as const;
  const focusKpis = [...summary.kpiSummaries]
    .sort((left, right) => right.overdueCount - left.overdueCount || right.median - left.median)
    .slice(0, 4);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        description="FLC Business Intelligence — Executive Overview"
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

      <div className="space-y-2">
        <div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Live Stock Position</h2>
            <p className="text-xs text-muted-foreground">The vehicles still moving through the pipeline right now.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stockCards.map((card) => (
            <button
              key={card.label}
              type="button"
              className="kpi-card text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={card.onClick}
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`h-4 w-4 ${card.tone}`} />
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {supportCards.map((card) => (
          <button
            key={card.label}
            type="button"
            className="kpi-card text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
            onClick={card.onClick}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.tone}`} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="glass-panel p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-foreground mb-1">Stock Flow Watchlist</h3>
            <p className="text-xs text-muted-foreground">A compact view of where open units are currently sitting.</p>
          </div>

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

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Stock Aging Risk</h4>
                <p className="text-xs text-muted-foreground">Open stock that needs attention before it becomes stale.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-1">Branch Comparison</h3>
          <p className="text-xs text-muted-foreground mb-4">Average BG→Delivery days by branch</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.branchComparison.map((item) => ({ branch: item.branch, avg: item.bgToDelivery }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(222, 44%, 10%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210, 20%, 92%)' }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {summary.branchComparison.map((_, i) => (
                  <Cell key={i} fill={chartColors[Math.min(i, chartColors.length - 1)]} />
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
              <p className="text-xs text-muted-foreground">Vehicle aging & milestone analysis</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {summary.kpiSummaries.slice(0, 3).map(k => (
              <div key={k.kpiId} className="p-2 rounded bg-secondary/50">
                <p className="text-[10px] text-muted-foreground truncate">{k.shortLabel}</p>
                <p className="text-lg font-bold text-foreground">{k.median}<span className="text-xs text-muted-foreground ml-0.5">d</span></p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-1">KPI Watchlist</h3>
          <p className="text-xs text-muted-foreground mb-4">The KPI lanes contributing the most current operational risk. Click one to sort the explorer by that metric.</p>
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
        </div>
      </div>
    </div>
  );
}
