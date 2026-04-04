import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Download, Search } from 'lucide-react';
import { useExplorer } from '@/hooks/api/use-platform';
import { downloadCsv } from '@/lib/export';
import type { VehicleCanonical } from '@flcbi/contracts';

export default function VehicleExplorer() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('bg_to_delivery');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const query = {
    search,
    branch: branchFilter,
    model: modelFilter,
    payment: paymentFilter,
    page,
    pageSize: 50,
    sortField: sortField as keyof VehicleCanonical,
    sortDirection: sortDir,
  };
  const { data, error, isError, isLoading, refetch } = useExplorer(query);
  const result = data?.result;
  const branches = result?.filterOptions.branches ?? [];
  const models = result?.filterOptions.models ?? [];
  const payments = result?.filterOptions.payments ?? [];

  const toggleSort = (field: string) => {
    setPage(1);
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-3 py-2 text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(field)}>
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </th>
  );

  if (isError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader
          title="Vehicle Explorer"
          description="Search, filter, and export vehicle milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        />
        <QueryErrorState
          title="Could not load vehicle explorer"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        description={result ? `${result.items.length} of ${result.total} vehicles` : 'Loading vehicles'}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => result && downloadCsv("vehicle-explorer.csv", result.items.map((item) => ({ ...item })))}
            disabled={!result || result.items.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search chassis or customer..." className="h-8 w-56 rounded-md bg-secondary border border-border pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1); }} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={modelFilter} onChange={e => { setModelFilter(e.target.value); setPage(1); }} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1); }} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Payments</option>
          {payments.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Chassis No.</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Branch</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Model</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Customer</th>
                <SortHeader field="bg_to_delivery" label="BG→Del" />
                <SortHeader field="bg_to_shipment_etd" label="BG→ETD" />
                <SortHeader field="etd_to_eta" label="ETD→ETA" />
                <SortHeader field="eta_to_outlet_received" label="ETA→Out" />
                <SortHeader field="outlet_received_to_delivery" label="Out→Del" />
                <SortHeader field="bg_to_disb" label="BG→Disb" />
                <SortHeader field="delivery_to_disb" label="Del→Disb" />
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">D2D</th>
              </tr>
            </thead>
            <tbody>
              {result && result.items.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No vehicles match the current filters yet.
                  </td>
                </tr>
              )}
              {result?.items.map(v => (
                <tr key={v.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}>
                  <td className="px-3 py-2 font-mono text-xs text-primary">{v.chassis_no}</td>
                  <td className="px-3 py-2 text-foreground">{v.branch_code}</td>
                  <td className="px-3 py-2 text-foreground">{v.model}</td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[120px]">{v.customer_name}</td>
                  {(['bg_to_delivery', 'bg_to_shipment_etd', 'etd_to_eta', 'eta_to_outlet_received', 'outlet_received_to_delivery', 'bg_to_disb', 'delivery_to_disb'] as const).map(f => {
                    const val = v[f];
                    return (
                      <td key={f} className="px-3 py-2 tabular-nums">
                        {val != null ? <span className={val < 0 ? 'text-destructive' : val > 45 ? 'text-warning' : 'text-foreground'}>{val}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">{v.is_d2d ? <StatusBadge status="warning" className="text-[10px]" /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground text-center py-3">Loading vehicles...</p>}
        {result && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
            <span>Page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={result.page * result.pageSize >= result.total}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
