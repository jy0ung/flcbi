import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EXPLORER_PRESET_LABELS } from '@flcbi/contracts';
import type { ExplorerPreset, VehicleCanonical } from '@flcbi/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { BellRing, Download, Search, X } from 'lucide-react';
import { useCreateExplorerExport, useCreateExportSubscription, useExplorer } from '@/hooks/api/use-platform';

const presetOptions: Array<{ value: ExplorerPreset; label: string }> = Object.entries(EXPLORER_PRESET_LABELS).map(
  ([value, label]) => ({ value: value as ExplorerPreset, label }),
);

const allowedSortFields: Array<keyof VehicleCanonical> = [
  'bg_date',
  'shipment_etd_pkg',
  'date_received_by_outlet',
  'reg_date',
  'delivery_date',
  'disb_date',
  'bg_to_delivery',
  'bg_to_shipment_etd',
  'etd_to_outlet_received',
  'outlet_received_to_reg',
  'reg_to_delivery',
  'bg_to_disb',
  'delivery_to_disb',
];

function parseSortField(value: string | null): keyof VehicleCanonical {
  if (value && allowedSortFields.includes(value as keyof VehicleCanonical)) {
    return value as keyof VehicleCanonical;
  }

  return 'bg_to_delivery';
}

function parseSortDirection(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default function VehicleExplorer() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const branchFilter = searchParams.get('branch') ?? 'all';
  const modelFilter = searchParams.get('model') ?? 'all';
  const paymentFilter = searchParams.get('payment') ?? 'all';
  const preset = (searchParams.get('preset') as ExplorerPreset | null) ?? undefined;
  const sortField = parseSortField(searchParams.get('sortField'));
  const sortDir = parseSortDirection(searchParams.get('sortDirection'));
  const page = parsePage(searchParams.get('page'));

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });

    setSearchParams(next);
  };

  const query = {
    search,
    branch: branchFilter,
    model: modelFilter,
    payment: paymentFilter,
    preset,
    page,
    pageSize: 50,
    sortField,
    sortDirection: sortDir,
  };

  const { data, error, isError, isLoading, refetch } = useExplorer(query);
  const createExport = useCreateExplorerExport();
  const createExportSubscription = useCreateExportSubscription();
  const result = data?.result;
  const branches = result?.filterOptions.branches ?? [];
  const models = result?.filterOptions.models ?? [];
  const payments = result?.filterOptions.payments ?? [];
  const presetLabel = preset ? EXPLORER_PRESET_LABELS[preset] : undefined;
  const canExport = hasRole(['company_admin', 'super_admin', 'director', 'general_manager', 'manager', 'analyst']);

  const toggleSort = (field: keyof VehicleCanonical) => {
    if (sortField === field) {
      updateParams({
        sortDirection: sortDir === 'asc' ? 'desc' : 'asc',
      });
      return;
    }

    updateParams({
      sortField: field,
      sortDirection: 'desc',
      page: '1',
    });
  };

  const SortHeader = ({ field, label }: { field: keyof VehicleCanonical; label: string }) => (
    <th
      className="px-3 py-2 text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </th>
  );

  const handleExport = async () => {
    try {
      const response = await createExport.mutateAsync({ query });
      toast.success(`Export queued: ${response.item.fileName}`);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : 'Could not queue export');
    }
  };

  const handleCreateSubscription = async () => {
    try {
      const response = await createExportSubscription.mutateAsync({ query, schedule: 'daily' });
      toast.success(`Saved daily export for ${response.item.requestedBy}`);
      navigate('/auto-aging/exports');
    } catch (subscriptionError) {
      toast.error(subscriptionError instanceof Error ? subscriptionError.message : 'Could not save daily export');
    }
  };

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
        description={
          presetLabel
            ? `${result ? `${result.total} vehicles` : 'Loading vehicles'} in ${presetLabel}`
            : result
              ? `${result.items.length} of ${result.total} vehicles`
              : 'Loading vehicles'
        }
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        actions={
          canExport ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/auto-aging/exports')}>
                View Exports
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCreateSubscription()}
                disabled={!result || result.total === 0 || createExportSubscription.isPending}
              >
                <BellRing className="h-3.5 w-3.5 mr-1" />
                {createExportSubscription.isPending ? 'Saving…' : 'Save Daily Export'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={!result || result.total === 0 || createExport.isPending}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                {createExport.isPending ? 'Queueing…' : 'Request CSV'}
              </Button>
            </div>
          ) : undefined
        }
      />

      {presetLabel && (
        <div className="glass-panel p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{presetLabel}</p>
            <p className="text-xs text-muted-foreground">This view was opened from an executive dashboard drill-down.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateParams({ preset: undefined, page: '1' })}
          >
            <X className="h-3.5 w-3.5 mr-1" />Clear Preset
          </Button>
        </div>
      )}

      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || undefined, page: '1' })}
            placeholder="Search chassis or customer..."
            className="h-8 w-56 rounded-md bg-secondary border border-border pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={preset ?? 'all'}
          onChange={(event) => updateParams({ preset: event.target.value === 'all' ? undefined : event.target.value, page: '1' })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Pipeline States</option>
          {presetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          value={branchFilter}
          onChange={(event) => updateParams({ branch: event.target.value, page: '1' })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Branches</option>
          {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
        </select>
        <select
          value={modelFilter}
          onChange={(event) => updateParams({ model: event.target.value, page: '1' })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Models</option>
          {models.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
        <select
          value={paymentFilter}
          onChange={(event) => updateParams({ payment: event.target.value, page: '1' })}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
        >
          <option value="all">All Payments</option>
          {payments.map((payment) => <option key={payment} value={payment}>{payment}</option>)}
        </select>
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
                <SortHeader field="bg_to_delivery" label="BG→Del" />
                <SortHeader field="bg_to_shipment_etd" label="BG→ETD" />
                <SortHeader field="etd_to_outlet_received" label="ETD→Out" />
                <SortHeader field="outlet_received_to_reg" label="Out→Reg" />
                <SortHeader field="reg_to_delivery" label="Reg→Del" />
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
              {result?.items.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  className="data-table-row cursor-pointer"
                  onClick={() => navigate(`/auto-aging/vehicles/${vehicle.chassis_no}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-primary">{vehicle.chassis_no}</td>
                  <td className="px-3 py-2 text-foreground">{vehicle.branch_code}</td>
                  <td className="px-3 py-2 text-foreground">{vehicle.model}</td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[120px]">{vehicle.customer_name}</td>
                  {(['bg_to_delivery', 'bg_to_shipment_etd', 'etd_to_outlet_received', 'outlet_received_to_reg', 'reg_to_delivery', 'bg_to_disb', 'delivery_to_disb'] as const).map((field) => {
                    const value = vehicle[field];
                    return (
                      <td key={field} className="px-3 py-2 tabular-nums">
                        {value != null ? <span className={value < 0 ? 'text-destructive' : value > 45 ? 'text-warning' : 'text-foreground'}>{value}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">{vehicle.is_d2d ? <StatusBadge status="warning" className="text-[10px]" /> : ''}</td>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateParams({ page: String(Math.max(1, page - 1)) })}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={result.page * result.pageSize >= result.total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
