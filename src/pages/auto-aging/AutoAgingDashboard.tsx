import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AgingTrendChart } from '@/components/charts/AgingTrendChart';
import { OutlierScatterChart } from '@/components/charts/OutlierScatterChart';
import { PaymentPieChart } from '@/components/charts/PaymentPieChart';
import { useAgingSummary } from '@/hooks/api/use-platform';

export default function AutoAgingDashboard() {
  const navigate = useNavigate();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const { data, error, isError, isLoading, refetch } = useAgingSummary({
    branch: branchFilter,
    model: modelFilter,
  });
  const summary = data?.summary;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading auto aging dashboard...</div>;
  }

  if (isError || !summary) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Dashboard"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Dashboard' }]}
        />
        <QueryErrorState
          title="Could not load auto aging dashboard"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (summary.totalVehicles === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Dashboard"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Dashboard' }]}
        />
        <div className="glass-panel p-8 text-center">
          <p className="text-lg font-semibold text-foreground mb-2">No vehicle data has been published yet</p>
          <p className="text-sm text-muted-foreground mb-5">
            Upload a validated workbook to populate operational metrics, quality checks, and trend analysis.
          </p>
          <Button onClick={() => navigate('/auto-aging/import')}>Open Import Center</Button>
        </div>
      </div>
    );
  }

  const branches = summary.filterOptions.branches;
  const models = summary.filterOptions.models;

  const processStages = [
    { label: 'BG Date', short: 'BG' },
    { label: 'Shipment ETD', short: 'ETD' },
    { label: 'Shipment ETA', short: 'ETA' },
    { label: 'Outlet Received', short: 'OUT' },
    { label: 'Delivery', short: 'DEL' },
    { label: 'Disbursement', short: 'DISB' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Auto Aging Dashboard"
        description="Vehicle aging analysis across operational milestones"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="text-right mr-2">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(summary.lastRefresh).toLocaleString()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
            <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{summary.totalVehicles} vehicles</span>
      </div>

      {/* Process Flow */}
      <div className="glass-panel p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Process Flow</h3>
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {processStages.map((stage, i) => (
            <React.Fragment key={stage.short}>
              <div className="flex flex-col items-center min-w-[80px]">
                <div className="w-12 h-12 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{stage.short}</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 text-center">{stage.label}</span>
              </div>
              {i < processStages.length - 1 && (
                <div className="flex-1 h-0.5 bg-border min-w-[20px] relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium whitespace-nowrap">
                    {summary.kpiSummaries[i]?.median ?? '—'}d
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {summary.kpiSummaries.map(kpi => (
          <KpiCard
            key={kpi.kpiId}
            label={kpi.shortLabel}
            value={kpi.median}
            subtitle={`Avg: ${kpi.average}d • P90: ${kpi.p90}d`}
            status={kpi.overdueCount > 10 ? 'critical' : kpi.overdueCount > 0 ? 'warning' : 'normal'}
            validCount={kpi.validCount}
            overdueCount={kpi.overdueCount}
            onClick={() => navigate('/auto-aging/vehicles')}
          />
        ))}
      </div>

      {/* Branch Heatmap + Quality */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Branch Comparison — Average Days</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={summary.branchComparison} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(222, 44%, 10%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210, 20%, 92%)' }} />
              <Bar dataKey="bgToDelivery" name="BG→Delivery" fill="hsl(43, 96%, 56%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="etdToEta" name="ETD→ETA" fill="hsl(199, 89%, 48%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outletToDelivery" name="Outlet→Delivery" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Data Quality</h3>
          <div className="space-y-2">
            {summary.qualityPreview.map(issue => (
              <div key={issue.id} className="p-2 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-foreground">{issue.chassisNo.slice(0, 12)}</span>
                  <StatusBadge status={issue.issueType} />
                </div>
                <p className="text-[10px] text-muted-foreground">{issue.message}</p>
              </div>
            ))}
            {summary.totalIssues > 8 && (
              <button onClick={() => navigate('/auto-aging/quality')} className="w-full text-xs text-primary hover:underline py-2">
                View all {summary.totalIssues} issues →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Trend + Payment Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <AgingTrendChart data={summary.trend} />
        <PaymentPieChart data={summary.paymentDistribution} />
      </div>

      {/* Outlier Scatter */}
      <OutlierScatterChart data={summary.outliers} onVehicleClick={(chassis) => navigate(`/auto-aging/vehicles/${chassis}`)} />

      {/* Slowest Vehicles Preview */}
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Slowest Vehicles (BG → Delivery)</h3>
          <button onClick={() => navigate('/auto-aging/vehicles')} className="text-xs text-primary hover:underline">View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Chassis</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Branch</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Model</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">BG→Del</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">ETD→ETA</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.slowestVehicles.map(v => (
                  <tr key={v.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{v.chassis_no}</td>
                    <td className="px-3 py-2 text-foreground">{v.branch_code}</td>
                    <td className="px-3 py-2 text-foreground">{v.model}</td>
                    <td className="px-3 py-2"><span className={(v.bg_to_delivery ?? 0) > 45 ? 'text-destructive font-semibold' : 'text-foreground'}>{v.bg_to_delivery}d</span></td>
                    <td className="px-3 py-2 text-foreground">{v.etd_to_eta != null ? `${v.etd_to_eta}d` : '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={(v.bg_to_delivery ?? 0) > 45 ? 'warning' : 'active'} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
