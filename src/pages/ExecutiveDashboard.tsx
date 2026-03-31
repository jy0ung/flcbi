import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Timer, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ExecutiveDashboard() {
  const { kpiSummaries, vehicles, qualityIssues, lastRefresh, importBatches } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const totalVehicles = vehicles.length;
  const totalOverdue = kpiSummaries.reduce((s, k) => s + k.overdueCount, 0);
  const totalIssues = qualityIssues.length;
  const lastBatch = importBatches[0];

  const branchData = React.useMemo(() => {
    const groups = new Map<string, number[]>();
    vehicles.forEach(v => {
      if (v.bgToDelivery !== null && v.bgToDelivery !== undefined && v.bgToDelivery >= 0) {
        const arr = groups.get(v.branch) || [];
        arr.push(v.bgToDelivery);
        groups.set(v.branch, arr);
      }
    });
    return Array.from(groups.entries()).map(([branch, vals]) => ({
      branch,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.avg - a.avg);
  }, [vehicles]);

  const chartColors = ['hsl(0, 72%, 51%)', 'hsl(38, 92%, 50%)', 'hsl(38, 92%, 50%)', 'hsl(43, 96%, 56%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)', 'hsl(142, 71%, 45%)'];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        description="FLC Business Intelligence — Executive Overview"
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(lastRefresh).toLocaleString()}</p>
            </div>
            {lastBatch && (
              <div className="px-3 py-1.5 rounded-md bg-success/10 border border-success/20">
                <p className="text-[10px] text-success font-medium">Latest: {lastBatch.fileName}</p>
              </div>
            )}
          </div>
        }
      />

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Total Vehicles</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalVehicles}</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-info" />
            <span className="text-xs text-muted-foreground font-medium">Import Batches</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{importBatches.length}</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs text-muted-foreground font-medium">SLA Breaches</span>
          </div>
          <p className="text-2xl font-bold text-warning">{totalOverdue}</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground font-medium">Quality Issues</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{totalIssues}</p>
        </div>
      </div>

      {/* Module Cards */}
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
            {kpiSummaries.slice(0, 3).map(k => (
              <div key={k.kpiId} className="p-2 rounded bg-secondary/50">
                <p className="text-[10px] text-muted-foreground truncate">{k.shortLabel}</p>
                <p className="text-lg font-bold text-foreground">{k.median}<span className="text-xs text-muted-foreground ml-0.5">d</span></p>
              </div>
            ))}
          </div>
        </div>

        {/* Branch Comparison Chart */}
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-1">Branch Comparison</h3>
          <p className="text-xs text-muted-foreground mb-4">Average BG→Delivery days by branch</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={branchData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(222, 44%, 10%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210, 20%, 92%)' }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {branchData.map((_, i) => (
                  <Cell key={i} fill={chartColors[Math.min(i, chartColors.length - 1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
