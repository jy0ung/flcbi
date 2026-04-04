import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Filter, Upload } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AgingTrendChart } from '@/components/charts/AgingTrendChart';
import { OutlierScatterChart } from '@/components/charts/OutlierScatterChart';
import { PaymentPieChart } from '@/components/charts/PaymentPieChart';

export default function AutoAgingDashboard() {
  const { kpiSummaries, vehicles, qualityIssues, lastRefresh, refreshKpis } = useData();
  const navigate = useNavigate();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();
  const models = [...new Set(vehicles.map(v => v.model))].sort();

  const filtered = vehicles.filter(v => {
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    if (modelFilter !== 'all' && v.model !== modelFilter) return false;
    return true;
  });

  const processStages = [
    { label: 'BG Date', short: 'BG' },
    { label: 'Shipment ETD', short: 'ETD' },
    { label: 'Outlet Received', short: 'OUT' },
    { label: 'Registration', short: 'REG' },
    { label: 'Delivery', short: 'DEL' },
    { label: 'Disbursement', short: 'DISB' },
  ];

  // Map process flow KPIs (the segment KPIs between stages)
  const segmentKpiIds = ['bg_to_shipment_etd', 'etd_to_outlet', 'outlet_to_reg', 'reg_to_delivery', 'delivery_to_disb'];

  const branchHeatmap = React.useMemo(() => {
    const groups = new Map<string, { bgToDelivery: number[]; etdToOutlet: number[]; regToDelivery: number[] }>();
    filtered.forEach(v => {
      const g = groups.get(v.branch_code) || { bgToDelivery: [], etdToOutlet: [], regToDelivery: [] };
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) g.bgToDelivery.push(v.bg_to_delivery);
      if (v.etd_to_outlet != null && v.etd_to_outlet >= 0) g.etdToOutlet.push(v.etd_to_outlet);
      if (v.reg_to_delivery != null && v.reg_to_delivery >= 0) g.regToDelivery.push(v.reg_to_delivery);
      groups.set(v.branch_code, g);
    });

    return Array.from(groups.entries()).map(([branch, g]) => ({
      branch,
      bgToDelivery: g.bgToDelivery.length ? Math.round(g.bgToDelivery.reduce((s, v) => s + v, 0) / g.bgToDelivery.length) : 0,
      etdToOutlet: g.etdToOutlet.length ? Math.round(g.etdToOutlet.reduce((s, v) => s + v, 0) / g.etdToOutlet.length) : 0,
      regToDelivery: g.regToDelivery.length ? Math.round(g.regToDelivery.reduce((s, v) => s + v, 0) / g.regToDelivery.length) : 0,
    })).sort((a, b) => b.bgToDelivery - a.bgToDelivery);
  }, [filtered]);

  if (vehicles.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Dashboard"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Dashboard' }]}
        />
        <div className="glass-panel p-12 text-center">
          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Data Imported Yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Upload your Excel workbook to start analyzing vehicle aging across milestones.</p>
          <Button onClick={() => navigate('/auto-aging/import')} className="bg-primary text-primary-foreground">
            <Upload className="h-4 w-4 mr-2" />Go to Import Center
          </Button>
        </div>
      </div>
    );
  }

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
              <p className="text-xs text-foreground">{new Date(lastRefresh).toLocaleString()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshKpis}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
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
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} vehicles</span>
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
                    {(() => {
                      const segKpi = kpiSummaries.find(k => k.kpiId === segmentKpiIds[i]);
                      return segKpi ? `${segKpi.median}d` : '—';
                    })()}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpiSummaries.map(kpi => (
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
            <BarChart data={branchHeatmap} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--foreground))' }} />
              <Bar dataKey="bgToDelivery" name="BG→Delivery" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="etdToOutlet" name="ETD→Outlet" fill="hsl(199, 89%, 48%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="regToDelivery" name="Reg→Delivery" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Data Quality</h3>
          <div className="space-y-2">
            {qualityIssues.length === 0 && <p className="text-xs text-muted-foreground">No issues detected.</p>}
            {qualityIssues.slice(0, 8).map(issue => (
              <div key={issue.id} className="p-2 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-foreground">{issue.chassisNo.slice(0, 12)}</span>
                  <StatusBadge status={issue.issueType} />
                </div>
                <p className="text-[10px] text-muted-foreground">{issue.message}</p>
              </div>
            ))}
            {qualityIssues.length > 8 && (
              <button onClick={() => navigate('/auto-aging/quality')} className="w-full text-xs text-primary hover:underline py-2">
                View all {qualityIssues.length} issues →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Trend + Payment Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <AgingTrendChart vehicles={filtered} />
        <PaymentPieChart vehicles={filtered} />
      </div>

      {/* Outlier Scatter */}
      <OutlierScatterChart vehicles={filtered} onVehicleClick={(chassis) => navigate(`/auto-aging/vehicles/${chassis}`)} />

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
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">ETD→Out</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Reg→Del</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .filter(v => v.bg_to_delivery != null && v.bg_to_delivery >= 0)
                .sort((a, b) => (b.bg_to_delivery ?? 0) - (a.bg_to_delivery ?? 0))
                .slice(0, 10)
                .map(v => (
                  <tr key={v.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{v.chassis_no}</td>
                    <td className="px-3 py-2 text-foreground">{v.branch_code}</td>
                    <td className="px-3 py-2 text-foreground">{v.model}</td>
                    <td className="px-3 py-2"><span className={(v.bg_to_delivery ?? 0) > 45 ? 'text-destructive font-semibold' : 'text-foreground'}>{v.bg_to_delivery}d</span></td>
                    <td className="px-3 py-2 text-foreground">{v.etd_to_outlet != null ? `${v.etd_to_outlet}d` : '—'}</td>
                    <td className="px-3 py-2 text-foreground">{v.reg_to_delivery != null ? `${v.reg_to_delivery}d` : '—'}</td>
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
