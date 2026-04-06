import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { Timer, TrendingUp, AlertTriangle, CheckCircle, Settings2, BarChart3, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

const ALL_KPI_IDS = KPI_DEFINITIONS.map(k => k.id);

// Advanced KPI view includes all 7 KPIs; basic includes the 3 main segment KPIs
const BASIC_KPIS = ['bg_to_delivery', 'bg_to_disb'];
const ADVANCED_KPIS = ALL_KPI_IDS;

export default function ExecutiveDashboard() {
  const { kpiSummaries, vehicles, qualityIssues, lastRefresh, importBatches, loading } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedKpis, setSelectedKpis] = useState<string[]>(ADVANCED_KPIS);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences
  useEffect(() => {
    async function loadPrefs() {
      const userId = user?.id || 'default';
      const { data } = await supabase
        .from('dashboard_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        const row = data as unknown as Record<string, unknown>;
        setSelectedKpis((row.selected_kpis as string[]) || ADVANCED_KPIS);
        setShowAdvanced(row.show_advanced_kpis as boolean ?? true);
      }
      setPrefsLoaded(true);
    }
    loadPrefs();
  }, [user?.id]);

  const savePreferences = useCallback(async (kpis: string[], advanced: boolean) => {
    const userId = user?.id || 'default';
    await supabase
      .from('dashboard_preferences')
      .upsert({
        user_id: userId,
        selected_kpis: kpis,
        show_advanced_kpis: advanced,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'user_id' });
  }, [user?.id]);

  const toggleKpi = (kpiId: string) => {
    setSelectedKpis(prev => {
      const next = prev.includes(kpiId) ? prev.filter(k => k !== kpiId) : [...prev, kpiId];
      savePreferences(next, showAdvanced);
      return next;
    });
  };

  const toggleAdvancedView = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    const newKpis = next ? ADVANCED_KPIS : BASIC_KPIS;
    setSelectedKpis(newKpis);
    savePreferences(newKpis, next);
  };

  const visibleKpis = kpiSummaries.filter(k => selectedKpis.includes(k.kpiId));

  const totalVehicles = vehicles.length;
  const totalOverdue = kpiSummaries.reduce((s, k) => s + k.overdueCount, 0);
  const totalIssues = qualityIssues.length;
  const lastBatch = importBatches[0];

  const branchData = React.useMemo(() => {
    const groups = new Map<string, number[]>();
    vehicles.forEach(v => {
      if (v.bg_to_delivery !== null && v.bg_to_delivery !== undefined && v.bg_to_delivery >= 0) {
        const arr = groups.get(v.branch_code) || [];
        arr.push(v.bg_to_delivery);
        groups.set(v.branch_code, arr);
      }
    });
    return Array.from(groups.entries()).map(([branch, vals]) => ({
      branch,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.avg - a.avg);
  }, [vehicles]);

  // Advanced: multi-KPI branch breakdown
  const advancedBranchData = React.useMemo(() => {
    const groups = new Map<string, Record<string, number[]>>();
    vehicles.forEach(v => {
      const g = groups.get(v.branch_code) || {};
      ALL_KPI_IDS.forEach(kpi => {
        const val = v[kpi as keyof typeof v] as number | null | undefined;
        if (val != null && val >= 0) {
          if (!g[kpi]) g[kpi] = [];
          g[kpi].push(val);
        }
      });
      groups.set(v.branch_code, g);
    });
    return Array.from(groups.entries()).map(([branch, g]) => {
      const row: Record<string, unknown> = { branch };
      ALL_KPI_IDS.forEach(kpi => {
        const arr = g[kpi] || [];
        row[kpi] = arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
      });
      return row;
    }).sort((a, b) => (b.bg_to_delivery as number || 0) - (a.bg_to_delivery as number || 0));
  }, [vehicles]);

  // SLA compliance rate
  const slaCompliance = React.useMemo(() => {
    if (kpiSummaries.length === 0) return 0;
    const total = kpiSummaries.reduce((s, k) => s + k.validCount, 0);
    const overdue = kpiSummaries.reduce((s, k) => s + k.overdueCount, 0);
    return total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;
  }, [kpiSummaries]);

  const chartColors = [
    'hsl(var(--primary))',
    'hsl(199, 89%, 48%)',
    'hsl(142, 71%, 45%)',
    'hsl(38, 92%, 50%)',
    'hsl(280, 65%, 60%)',
    'hsl(350, 80%, 55%)',
    'hsl(175, 70%, 40%)',
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

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
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-3.5 w-3.5 mr-1" />Customize
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Dashboard KPI Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">Advanced View</p>
                      <p className="text-xs text-muted-foreground">Show all 7 KPI metrics</p>
                    </div>
                    <Button
                      variant={showAdvanced ? 'default' : 'outline'}
                      size="sm"
                      onClick={toggleAdvancedView}
                    >
                      {showAdvanced ? 'Active' : 'Enable'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select KPIs to Display</p>
                    {KPI_DEFINITIONS.map(kpi => (
                      <label key={kpi.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/30 cursor-pointer">
                        <Checkbox
                          checked={selectedKpis.includes(kpi.id)}
                          onCheckedChange={() => toggleKpi(kpi.id)}
                        />
                        <div>
                          <p className="text-sm text-foreground">{kpi.shortLabel}</p>
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground font-medium">SLA Compliance</span>
          </div>
          <p className="text-2xl font-bold text-success">{slaCompliance}%</p>
        </div>
      </div>

      {/* Advanced KPI Cards */}
      {visibleKpis.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              KPI Metrics {showAdvanced && <span className="text-xs font-normal text-muted-foreground">(Advanced View)</span>}
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {visibleKpis.map(kpi => (
              <KpiCard
                key={kpi.kpiId}
                label={kpi.shortLabel}
                value={kpi.median}
                subtitle={`Avg: ${kpi.average}d • P90: ${kpi.p90}d • SLA: ${kpi.slaDays}d`}
                status={kpi.overdueCount > 10 ? 'critical' : kpi.overdueCount > 0 ? 'warning' : 'normal'}
                validCount={kpi.validCount}
                overdueCount={kpi.overdueCount}
                onClick={() => navigate('/auto-aging')}
              />
            ))}
          </div>
        </div>
      )}

      {/* Module Cards + Branch Comparison */}
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
          <p className="text-xs text-muted-foreground mb-4">
            {showAdvanced ? 'Multi-KPI average days by branch' : 'Average BG→Delivery days by branch'}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            {showAdvanced ? (
              <BarChart data={advancedBranchData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="branch" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px', color: 'hsl(var(--foreground))' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {selectedKpis.map((kpiId, i) => {
                  const def = KPI_DEFINITIONS.find(k => k.id === kpiId);
                  return (
                    <Bar key={kpiId} dataKey={kpiId} name={def?.shortLabel || kpiId} fill={chartColors[i % chartColors.length]} radius={[2, 2, 0, 0]} />
                  );
                })}
              </BarChart>
            ) : (
              <BarChart data={branchData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {branchData.map((_, i) => (
                    <Cell key={i} fill={chartColors[Math.min(i, chartColors.length - 1)]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* SLA Performance Summary (Advanced) */}
      {showAdvanced && visibleKpis.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            SLA Performance Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium">KPI</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">SLA Target</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">Median</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">Average</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">P90</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">Valid</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">Overdue</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium text-right">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {visibleKpis.map(kpi => {
                  const compliance = kpi.validCount > 0 ? Math.round(((kpi.validCount - kpi.overdueCount) / kpi.validCount) * 100) : 100;
                  return (
                    <tr key={kpi.kpiId} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-3 py-2.5 font-medium text-foreground">{kpi.shortLabel}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{kpi.slaDays}d</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={kpi.median > kpi.slaDays ? 'text-destructive font-semibold' : 'text-foreground'}>{kpi.median}d</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">{kpi.average}d</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={kpi.p90 > kpi.slaDays ? 'text-warning' : 'text-foreground'}>{kpi.p90}d</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{kpi.validCount}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={kpi.overdueCount > 0 ? 'text-destructive font-semibold' : 'text-success'}>{kpi.overdueCount}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${compliance >= 90 ? 'bg-success/15 text-success' : compliance >= 70 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}>
                          {compliance}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
