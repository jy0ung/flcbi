import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Search } from 'lucide-react';

export default function VehicleExplorer() {
  const { vehicles } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('bg_to_delivery');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();
  const models = [...new Set(vehicles.map(v => v.model))].sort();
  const payments = [...new Set(vehicles.map(v => v.payment_method))].sort();

  const filtered = vehicles.filter(v => {
    if (search && !v.chassis_no.toLowerCase().includes(search.toLowerCase()) && !v.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    if (modelFilter !== 'all' && v.model !== modelFilter) return false;
    if (paymentFilter !== 'all' && v.payment_method !== paymentFilter) return false;
    return true;
  }).sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortField] as number ?? 0;
    const bVal = (b as unknown as Record<string, unknown>)[sortField] as number ?? 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-3 py-2 text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(field)}>
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </th>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        description={`${filtered.length} of ${vehicles.length} vehicles`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        actions={<Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>}
      />

      {/* Filters */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chassis or customer..." className="h-8 w-56 rounded-md bg-secondary border border-border pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
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
              {filtered.slice(0, 100).map(v => (
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
        {filtered.length > 100 && <p className="text-xs text-muted-foreground text-center py-3">Showing 100 of {filtered.length} results</p>}
      </div>
    </div>
  );
}
