import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export default function VehicleExplorer() {
  const { vehicles, reloadFromDb } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('bg_to_delivery');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  // Reset page when filters change
  React.useEffect(() => { setPage(1); }, [search, branchFilter, modelFilter, paymentFilter, pageSize]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-3 py-2 text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort(field)}>
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </th>
  );

  const kpiColumns = [
    { field: 'bg_to_delivery', label: 'BG→Del' },
    { field: 'bg_to_shipment_etd', label: 'BG→ETD' },
    { field: 'etd_to_outlet', label: 'ETD→Out' },
    { field: 'outlet_to_reg', label: 'Out→Reg' },
    { field: 'reg_to_delivery', label: 'Reg→Del' },
    { field: 'bg_to_disb', label: 'BG→Disb' },
    { field: 'delivery_to_disb', label: 'Del→Disb' },
  ] as const;

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        description={`${filtered.length} of ${vehicles.length} vehicles`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        actions={<Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>}
      />

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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(s => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Chassis No.</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Branch</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Model</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Customer</th>
                {kpiColumns.map(c => <SortHeader key={c.field} field={c.field} label={c.label} />)}
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">D2D</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map(v => (
                <tr key={v.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}>
                  <td className="px-3 py-2 font-mono text-xs text-primary">{v.chassis_no}</td>
                  <td className="px-3 py-2 text-foreground">{v.branch_code}</td>
                  <td className="px-3 py-2 text-foreground">{v.model}</td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[120px]">{v.customer_name}</td>
                  {kpiColumns.map(c => {
                    const val = v[c.field as keyof typeof v] as number | null | undefined;
                    return (
                      <td key={c.field} className="px-3 py-2 tabular-nums">
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

        {/* Pagination controls */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} of {filtered.length} results
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {getPageNumbers().map((p, i) =>
              p === 'ellipsis' ? (
                <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? 'default' : 'outline'}
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}
