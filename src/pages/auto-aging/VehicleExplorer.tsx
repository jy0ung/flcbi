import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EXPLORER_PRESET_LABELS } from '@flcbi/contracts';
import type { ExplorerPreset, ExplorerQuery, ExplorerSavedView, VehicleCanonical } from '@flcbi/contracts';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  BellRing,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCreateExplorerExport,
  useCreateExportSubscription,
  useCreateExplorerSavedView,
  useDeleteExplorerSavedView,
  useExplorer,
  useExplorerSavedViews,
} from '@/hooks/api/use-platform';

const presetOptions: Array<{ value: ExplorerPreset; label: string }> = Object.entries(EXPLORER_PRESET_LABELS).map(
  ([value, label]) => ({ value: value as ExplorerPreset, label }),
);
const explorerPageSizeOptions = [25, 50, 100] as const;
const defaultExplorerPageSize = 50;

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

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  return explorerPageSizeOptions.find((option) => option === parsed) ?? defaultExplorerPageSize;
}

function formatExplorerRange(total: number, page: number, pageSize: number) {
  if (total === 0) {
    return 'No vehicles found';
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `Showing ${start}-${end} of ${total} vehicles`;
}

function buildPaginationItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1];
  const windowStart = Math.max(2, page - 1);
  const windowEnd = Math.min(totalPages - 1, page + 1);

  if (windowStart > 2) {
    items.push('ellipsis-start');
  }

  for (let current = windowStart; current <= windowEnd; current += 1) {
    items.push(current);
  }

  if (windowEnd < totalPages - 1) {
    items.push('ellipsis-end');
  }

  items.push(totalPages);
  return items;
}

function normalizeExplorerViewQuery(query: ExplorerQuery): ExplorerQuery {
  return {
    search: query.search?.trim() || undefined,
    branch: query.branch ?? 'all',
    model: query.model ?? 'all',
    payment: query.payment ?? 'all',
    preset: query.preset,
    page: 1,
    pageSize: query.pageSize ?? defaultExplorerPageSize,
    sortField: query.sortField ?? 'bg_to_delivery',
    sortDirection: query.sortDirection ?? 'desc',
  };
}

function buildExplorerSearchParams(query: ExplorerQuery) {
  const params = new URLSearchParams();
  const normalized = normalizeExplorerViewQuery(query);

  if (normalized.search) params.set('search', normalized.search);
  if (normalized.branch !== 'all') params.set('branch', normalized.branch);
  if (normalized.model !== 'all') params.set('model', normalized.model);
  if (normalized.payment !== 'all') params.set('payment', normalized.payment);
  if (normalized.preset) params.set('preset', normalized.preset);
  if (normalized.pageSize !== defaultExplorerPageSize) params.set('pageSize', String(normalized.pageSize));
  if (normalized.sortField !== 'bg_to_delivery') params.set('sortField', normalized.sortField);
  if (normalized.sortDirection !== 'desc') params.set('sortDirection', normalized.sortDirection);

  return params;
}

function explorerViewKey(query: ExplorerQuery) {
  return JSON.stringify(normalizeExplorerViewQuery(query));
}

function describeExplorerViewQuery(query: ExplorerQuery) {
  const parts = [
    query.search?.trim() ? `Search: ${query.search.trim()}` : null,
    query.branch && query.branch !== 'all' ? `Branch: ${query.branch}` : null,
    query.model && query.model !== 'all' ? `Model: ${query.model}` : null,
    query.payment && query.payment !== 'all' ? `Payment: ${query.payment}` : null,
    query.preset ? `Preset: ${EXPLORER_PRESET_LABELS[query.preset]}` : null,
    query.pageSize !== defaultExplorerPageSize ? `${query.pageSize} rows/page` : null,
    query.sortField ? `Sort: ${String(query.sortField).replaceAll('_', ' ')} ${query.sortDirection === 'asc' ? '↑' : '↓'}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'All vehicles';
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
  const pageSize = parsePageSize(searchParams.get('pageSize'));

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });

    setSearchParams(next);
  };

  const openSaveDialog = () => {
    setSavedViewName(activeSavedView?.name ?? '');
    setIsSaveDialogOpen(true);
  };

  const applySavedView = (savedView: ExplorerSavedView) => {
    setSearchParams(buildExplorerSearchParams(savedView.query));
  };

  const handleSaveView = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = savedViewName.trim();
    if (!name) {
      toast.error('Saved view name is required');
      return;
    }

    try {
      const response = await createSavedView.mutateAsync({
        name,
        query: normalizeExplorerViewQuery(query),
      });
      toast.success(`Saved view ${response.item.name}`);
      setIsSaveDialogOpen(false);
      setSavedViewName('');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save the view');
    }
  };

  const handleDeleteSavedView = async () => {
    if (!deletingSavedView) {
      return;
    }

    const target = deletingSavedView;
    try {
      await deleteSavedView.mutateAsync(target.id);
      toast.success(`Deleted saved view ${target.name}`);
      setDeletingSavedView(null);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Could not delete the saved view');
    }
  };

  const query = {
    search,
    branch: branchFilter,
    model: modelFilter,
    payment: paymentFilter,
    preset,
    page,
    pageSize,
    sortField,
    sortDirection: sortDir,
  };

  const { data, error, isError, isLoading, refetch } = useExplorer(query);
  const savedViewsQuery = useExplorerSavedViews();
  const createSavedView = useCreateExplorerSavedView();
  const deleteSavedView = useDeleteExplorerSavedView();
  const createExport = useCreateExplorerExport();
  const createExportSubscription = useCreateExportSubscription();
  const result = data?.result;
  const branches = result?.filterOptions.branches ?? [];
  const models = result?.filterOptions.models ?? [];
  const payments = result?.filterOptions.payments ?? [];
  const presetLabel = preset ? EXPLORER_PRESET_LABELS[preset] : undefined;
  const canExport = hasRole(['company_admin', 'super_admin', 'director', 'general_manager', 'manager', 'analyst']);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const paginationItems = buildPaginationItems(page, totalPages);
  const [pageInput, setPageInput] = React.useState(String(page));
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  const [savedViewName, setSavedViewName] = React.useState('');
  const [deletingSavedView, setDeletingSavedView] = React.useState<ExplorerSavedView | null>(null);
  const savedViews = savedViewsQuery.data?.items ?? [];
  const currentViewKey = explorerViewKey(query);
  const activeSavedView = React.useMemo(
    () => savedViews.find((savedView) => explorerViewKey(savedView.query) === currentViewKey) ?? null,
    [currentViewKey, savedViews],
  );

  React.useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  React.useEffect(() => {
    if (!result) {
      return;
    }

    const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (page > lastPage) {
      updateParams({ page: String(lastPage) });
    }
  }, [page, result, searchParams]);

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

  const handlePageChange = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    updateParams({ page: String(boundedPage) });
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    updateParams({ pageSize: String(nextPageSize), page: '1' });
  };

  const handlePageJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number(pageInput);
    if (!Number.isFinite(requestedPage)) {
      setPageInput(String(page));
      return;
    }

    handlePageChange(requestedPage);
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
            ? `${result ? `${formatExplorerRange(result.total, result.page, result.pageSize)} in ${presetLabel}` : 'Loading vehicles'}`
            : result
              ? formatExplorerRange(result.total, result.page, result.pageSize)
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

      <div className="glass-panel p-4 space-y-4" data-testid="explorer-saved-views-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Saved Views</p>
            <p className="text-xs text-muted-foreground">
              Save the current filter and sort combination to reopen a common slice in one click.
            </p>
            {activeSavedView && (
              <Badge variant="secondary" className="w-fit">
                Active: {activeSavedView.name}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={openSaveDialog} data-testid="explorer-save-view-button">
            <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
            Save Current View
          </Button>
        </div>

        {savedViewsQuery.isError && (
          <p className="text-xs text-destructive">
            Could not load saved views right now. You can still save a new one.
          </p>
        )}

        {!savedViewsQuery.isError && savedViews.length === 0 && (
          <p className="text-xs text-muted-foreground" data-testid="explorer-saved-views-empty">
            No saved views yet. Save this filter combination to come back to it later.
          </p>
        )}

        {!savedViewsQuery.isError && savedViews.length > 0 && (
          <div className="space-y-2">
            {savedViews.map((savedView) => {
              const isActive = activeSavedView?.id === savedView.id;

              return (
                <div
                  key={savedView.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open saved view ${savedView.name}`}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition ${
                    isActive ? 'border-primary/60 bg-primary/5' : 'border-border bg-secondary/10 hover:bg-secondary/20'
                  }`}
                  onClick={() => applySavedView(savedView)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      applySavedView(savedView);
                    }
                  }}
                  data-testid="explorer-saved-view-row"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{savedView.name}</p>
                      {isActive && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{describeExplorerViewQuery(savedView.query)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeletingSavedView(savedView);
                    }}
                    data-testid="explorer-saved-view-delete"
                    aria-label={`Delete saved view ${savedView.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {result && (
        <div
          className="glass-panel p-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
          data-testid="vehicle-explorer-pagination-top"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground" data-testid="vehicle-explorer-pagination-summary">
              {formatExplorerRange(result.total, result.page, result.pageSize)}
            </p>
            <p className="text-xs text-muted-foreground">
              Page {result.page} of {totalPages}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="vehicle-explorer-page-size" className="text-xs font-medium text-muted-foreground">
              Rows per page
            </label>
            <select
              id="vehicle-explorer-page-size"
              data-testid="vehicle-explorer-page-size"
              value={pageSize}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
            >
              {explorerPageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              data-testid="vehicle-explorer-previous-page-top"
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              data-testid="vehicle-explorer-next-page-top"
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

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
          <div
            className="flex flex-col gap-3 border-t border-border/50 px-4 py-4"
            data-testid="vehicle-explorer-pagination-bottom"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="text-xs text-muted-foreground">
                {formatExplorerRange(result.total, result.page, result.pageSize)}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={page === 1}
                  data-testid="vehicle-explorer-first-page"
                >
                  <ChevronsLeft className="mr-1 h-3.5 w-3.5" />
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  data-testid="vehicle-explorer-previous-page"
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Previous
                </Button>

                {paginationItems.map((item) => {
                  if (typeof item !== 'number') {
                    return (
                      <span key={item} className="px-2 text-xs text-muted-foreground">
                        …
                      </span>
                    );
                  }

                  return (
                    <Button
                      key={item}
                      variant={item === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(item)}
                      aria-current={item === page ? 'page' : undefined}
                      data-testid={`vehicle-explorer-page-${item}`}
                    >
                      {item}
                    </Button>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  data-testid="vehicle-explorer-next-page"
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={page >= totalPages}
                  data-testid="vehicle-explorer-last-page"
                >
                  Last
                  <ChevronsRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <form className="flex flex-wrap items-center gap-2" onSubmit={handlePageJump}>
              <label htmlFor="vehicle-explorer-page-jump" className="text-xs font-medium text-muted-foreground">
                Go to page
              </label>
              <input
                id="vehicle-explorer-page-jump"
                data-testid="vehicle-explorer-page-jump"
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                className="h-8 w-20 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
              />
              <Button type="submit" variant="outline" size="sm">
                Go
              </Button>
              <span className="text-xs text-muted-foreground">
                Max page: {totalPages}
              </span>
            </form>
          </div>
        )}
      </div>

      <Dialog
        open={isSaveDialogOpen}
        onOpenChange={(open) => {
          setIsSaveDialogOpen(open);
          if (!open) {
            setSavedViewName('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Explorer View</DialogTitle>
            <DialogDescription>
              Save the current search, branch, model, payment, preset, sort, and page size so you can reopen it later.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveView}>
            <div className="space-y-2">
              <label htmlFor="explorer-saved-view-name" className="text-sm font-medium text-foreground">
                View name
              </label>
              <Input
                id="explorer-saved-view-name"
                data-testid="explorer-save-view-name"
                value={savedViewName}
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="e.g. KK Ativa open delivery"
                maxLength={120}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              If you save again with the same name, the existing view is updated.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSavedView.isPending} data-testid="explorer-save-view-submit">
                {createSavedView.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
                Save View
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingSavedView)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingSavedView(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved view?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingSavedView
                ? `Remove ${deletingSavedView.name} from your saved explorer views? This cannot be undone.`
                : 'Remove this saved explorer view? This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSavedView.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteSavedView()}
              disabled={deleteSavedView.isPending}
              data-testid="explorer-saved-view-delete-confirm"
            >
              {deleteSavedView.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Delete view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
