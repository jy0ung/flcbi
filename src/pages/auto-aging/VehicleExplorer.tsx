import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  EXPLORER_PRESET_LABELS,
  describeExplorerQuery,
  listExplorerQueryTokens,
  normalizeExplorerQuery,
} from "@flcbi/contracts";
import type {
  ExplorerColumnFilterValue,
  ExplorerFilterSet,
  ExplorerPreset,
  ExplorerQuery,
  ExplorerSavedView,
} from "@flcbi/contracts";
import { BellRing, BookmarkPlus, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  type ExplorerFilterApi,
  type ExplorerFilterDateKey,
  type ExplorerFilterNumberKey,
  type ExplorerFilterTextKey,
  type ExplorerSimpleField,
  isExplorerFilterSet,
} from "@/lib/explorer-filters";
import {
  useCreateExplorerExport,
  useCreateExportSubscription,
  useCreateExplorerSavedView,
  useDeleteExplorerSavedView,
  useExplorer,
  useExplorerSavedViews,
  useExplorerMappings,
  useUpdateVehicleCorrections,
} from "@/hooks/api/use-platform";
import { VehicleExplorerGrid } from "./VehicleExplorerGrid";

const explorerPageSizeOptions = [25, 50, 100] as const;
const defaultExplorerPageSize = 50;
const defaultExplorerSortField = "row_number";

function parseSortDirection(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  return explorerPageSizeOptions.find((option) => option === parsed) ?? defaultExplorerPageSize;
}

function parseFiltersParam(value: string | null): ExplorerFilterSet | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as ExplorerFilterSet;
    return isExplorerFilterSet(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseExplorerQuery(searchParams: URLSearchParams): ExplorerQuery {
  return normalizeExplorerQuery({
    search: searchParams.get("search") ?? undefined,
    branch: searchParams.get("branch") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    payment: searchParams.get("payment") ?? undefined,
    preset: (searchParams.get("preset") as ExplorerPreset | null) ?? undefined,
    filters: parseFiltersParam(searchParams.get("filters")),
    page: parsePage(searchParams.get("page")),
    pageSize: parsePageSize(searchParams.get("pageSize")),
    sortField: searchParams.get("sortField") ?? undefined,
    sortDirection: parseSortDirection(searchParams.get("sortDirection")),
  });
}

function buildExplorerSearchParams(query: ExplorerQuery) {
  const params = new URLSearchParams();
  const normalized = normalizeExplorerQuery(query);

  if (normalized.search) params.set("search", normalized.search);
  if (normalized.branch !== "all") params.set("branch", normalized.branch);
  if (normalized.model !== "all") params.set("model", normalized.model);
  if (normalized.payment !== "all") params.set("payment", normalized.payment);
  if (normalized.preset) params.set("preset", normalized.preset);
  if (normalized.filters) params.set("filters", JSON.stringify(normalized.filters));
  if (normalized.page !== 1) params.set("page", String(normalized.page));
  if (normalized.pageSize !== defaultExplorerPageSize) params.set("pageSize", String(normalized.pageSize));
  if (normalized.sortField && normalized.sortField !== defaultExplorerSortField) params.set("sortField", normalized.sortField);
  if (normalized.sortDirection !== "desc") params.set("sortDirection", normalized.sortDirection);

  return params;
}

function normalizeExplorerViewQuery(query: ExplorerQuery): ExplorerQuery {
  const normalized = normalizeExplorerQuery(query);
  return {
    ...normalized,
    page: 1,
  };
}

function explorerViewKey(query: ExplorerQuery) {
  return JSON.stringify(normalizeExplorerViewQuery(query));
}

function formatExplorerRange(total: number, page: number, pageSize: number) {
  if (total === 0) {
    return "No vehicles found";
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `Showing ${start}-${end} of ${total} vehicles`;
}

function buildPaginationItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis-start" | "ellipsis-end"> = [1];
  const windowStart = Math.max(2, page - 1);
  const windowEnd = Math.min(totalPages - 1, page + 1);

  if (windowStart > 2) {
    items.push("ellipsis-start");
  }

  for (let current = windowStart; current <= windowEnd; current += 1) {
    items.push(current);
  }

  if (windowEnd < totalPages - 1) {
    items.push("ellipsis-end");
  }

  items.push(totalPages);
  return items;
}

export default function VehicleExplorer() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = React.useMemo(() => parseExplorerQuery(searchParams), [searchParams]);
  const [pageInput, setPageInput] = React.useState(String(query.page));
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  const [isSavedViewsMenuOpen, setIsSavedViewsMenuOpen] = React.useState(false);
  const [savedViewName, setSavedViewName] = React.useState("");
  const [deletingSavedView, setDeletingSavedView] = React.useState<ExplorerSavedView | null>(null);

  const updateQuery = React.useCallback((updater: (current: ExplorerQuery) => ExplorerQuery) => {
    setSearchParams(buildExplorerSearchParams(updater(query)));
  }, [query, setSearchParams]);

  const updateSimpleField = React.useCallback(
    (field: ExplorerSimpleField, value: string | undefined) => {
      updateQuery((current) => ({
        ...current,
        [field]: value,
        page: 1,
      }));
    },
    [updateQuery],
  );

  const updateFilterState = React.useCallback((mutator: (current: ExplorerFilterSet) => ExplorerFilterSet | undefined) => {
    updateQuery((current) => {
      const nextFilters = mutator(current.filters ?? {});
      return {
        ...current,
        filters: nextFilters,
        page: 1,
      };
    });
  }, [updateQuery]);

  const updateTextFilter = React.useCallback((field: ExplorerFilterTextKey, value: string) => {
    updateFilterState((current) => {
      const next = { ...current };
      const trimmed = value.trim();
      if (trimmed) {
        next[field] = trimmed;
      } else {
        delete next[field];
      }
      return Object.keys(next).length > 0 ? next : undefined;
    });
  }, [updateFilterState]);

  const updateBooleanFilter = React.useCallback((value: string) => {
    updateFilterState((current) => {
      const next = { ...current };
      if (value === "all") {
        delete next.isD2D;
      } else {
        next.isD2D = value === "true";
      }
      return Object.keys(next).length > 0 ? next : undefined;
    });
  }, [updateFilterState]);

  const updateColumnFilter = React.useCallback((field: string, value: ExplorerColumnFilterValue | undefined) => {
    updateFilterState((current) => {
      const next = { ...current };
      const columnFilters = { ...(current.columnFilters ?? {}) };
      if (value === undefined) {
        delete columnFilters[field];
      } else {
        columnFilters[field] = value;
      }

      if (Object.keys(columnFilters).length > 0) {
        next.columnFilters = columnFilters;
      } else {
        delete next.columnFilters;
      }

      return Object.keys(next).length > 0 ? next : undefined;
    });
  }, [updateFilterState]);

  const updateDateRangeFilter = React.useCallback((field: ExplorerFilterDateKey, value: { from?: string; to?: string }) => {
    updateFilterState((current) => {
      const next = { ...current };
      const from = value.from?.trim();
      const to = value.to?.trim();
      if (from || to) {
        next[field] = {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        };
      } else {
        delete next[field];
      }
      return Object.keys(next).length > 0 ? next : undefined;
    });
  }, [updateFilterState]);

  const updateNumberRangeFilter = React.useCallback((field: ExplorerFilterNumberKey, value: { min?: string; max?: string }) => {
    updateFilterState((current) => {
      const next = { ...current };
      const min = value.min?.trim();
      const max = value.max?.trim();
      const numericMin = min ? Number(min) : undefined;
      const numericMax = max ? Number(max) : undefined;
      if ((numericMin != null && Number.isFinite(numericMin)) || (numericMax != null && Number.isFinite(numericMax))) {
        next[field] = {
          ...(numericMin != null && Number.isFinite(numericMin) ? { min: numericMin } : {}),
          ...(numericMax != null && Number.isFinite(numericMax) ? { max: numericMax } : {}),
        };
      } else {
        delete next[field];
      }
      return Object.keys(next).length > 0 ? next : undefined;
    });
  }, [updateFilterState]);

  const clearAllFilters = React.useCallback(() => {
    updateQuery((current) => ({
      ...current,
      search: undefined,
      branch: "all",
      model: "all",
      payment: "all",
      preset: undefined,
      filters: undefined,
      page: 1,
    }));
  }, [updateQuery]);

  const filterApi = React.useMemo<ExplorerFilterApi>(() => ({
    updateSimpleField,
    updateTextFilter,
    updateBooleanFilter,
    updateDateRangeFilter,
    updateNumberRangeFilter,
    updateColumnFilter,
    clearAllFilters,
  }), [
    updateSimpleField,
    updateTextFilter,
    updateBooleanFilter,
    updateDateRangeFilter,
    updateNumberRangeFilter,
    updateColumnFilter,
    clearAllFilters,
  ]);

  const openSaveDialog = () => {
    setSavedViewName(activeSavedView?.name ?? "");
    setIsSaveDialogOpen(true);
    setIsSavedViewsMenuOpen(false);
  };

  const applySavedView = (savedView: ExplorerSavedView) => {
    setSearchParams(buildExplorerSearchParams(savedView.query));
    setIsSavedViewsMenuOpen(false);
  };

  const handleSaveView = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = savedViewName.trim();
    if (!name) {
      toast.error("Saved view name is required");
      return;
    }

    try {
      const response = await createSavedView.mutateAsync({
        name,
        query: normalizeExplorerViewQuery(query),
      });
      toast.success(`Saved view ${response.item.name}`);
      setIsSaveDialogOpen(false);
      setSavedViewName("");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save the view");
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
      setIsSavedViewsMenuOpen(false);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Could not delete the saved view");
    }
  };

  const { data, error, isError, isLoading, refetch } = useExplorer(query);
  const savedViewsQuery = useExplorerSavedViews();
  const createSavedView = useCreateExplorerSavedView();
  const deleteSavedView = useDeleteExplorerSavedView();
  const createExport = useCreateExplorerExport();
  const createExportSubscription = useCreateExportSubscription();
  const updateCorrections = useUpdateVehicleCorrections();
  const mappingsQuery = useExplorerMappings();
  const result = data?.result;
  const mappings = mappingsQuery.data;
  const presetLabel = query.preset ? EXPLORER_PRESET_LABELS[query.preset] : undefined;
  const canExport = hasRole(["company_admin", "super_admin", "director", "general_manager", "manager", "analyst"]);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const paginationItems = buildPaginationItems(query.page, totalPages);
  const savedViews = savedViewsQuery.data?.items ?? [];
  const currentViewKey = explorerViewKey(query);
  const activeSavedView = React.useMemo(
    () => savedViews.find((savedView) => explorerViewKey(savedView.query) === currentViewKey) ?? null,
    [currentViewKey, savedViews],
  );
  const filterTokens = React.useMemo(() => listExplorerQueryTokens(query), [query]);

  React.useEffect(() => {
    setPageInput(String(query.page));
  }, [query.page]);

  React.useEffect(() => {
    if (!result) {
      return;
    }

    const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (query.page > lastPage) {
      updateQuery((current) => ({ ...current, page: lastPage }));
    }
  }, [query.page, result, updateQuery]);

  const toggleSort = (field: string) => {
    if (query.sortField === field) {
      updateQuery((current) => ({
        ...current,
        sortDirection: current.sortDirection === "asc" ? "desc" : "asc",
        page: 1,
      }));
      return;
    }

    updateQuery((current) => ({
      ...current,
      sortField: field,
      sortDirection: "desc",
      page: 1,
    }));
  };

  const handlePageChange = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    updateQuery((current) => ({ ...current, page: boundedPage }));
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    updateQuery((current) => ({ ...current, pageSize: nextPageSize, page: 1 }));
  };

  const handlePageJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number(pageInput);
    if (!Number.isFinite(requestedPage)) {
      setPageInput(String(query.page));
      return;
    }

    handlePageChange(requestedPage);
  };

  const handleExport = async () => {
    try {
      const response = await createExport.mutateAsync({ query });
      toast.success(`Export queued: ${response.item.fileName}`);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Could not queue export");
    }
  };

  const handleCreateSubscription = async () => {
    try {
      const response = await createExportSubscription.mutateAsync({ query, schedule: "daily" });
      toast.success(`Saved daily export for ${response.item.requestedBy}`);
      navigate("/auto-aging/exports");
    } catch (subscriptionError) {
      toast.error(subscriptionError instanceof Error ? subscriptionError.message : "Could not save daily export");
    }
  };

  if (isError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader
          title="Vehicle Explorer"
          description="Search, filter, and edit the raw workbook table"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Vehicle Explorer" }]}
        />
        <QueryErrorState title="Could not load vehicle explorer" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Vehicle Explorer" }]}
      />

      <div className="glass-panel space-y-3 p-4" data-testid="vehicle-explorer-toolbar">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="vehicle-explorer-filter-search"
              value={query.search ?? ""}
              onChange={(event) => updateSimpleField("search", event.target.value || undefined)}
              placeholder="Search chassis, branch, model, customer, or salesman..."
              className="h-9 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu open={isSavedViewsMenuOpen} onOpenChange={setIsSavedViewsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="explorer-saved-views-trigger">
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  <span className="max-w-[12rem] truncate">{activeSavedView?.name ?? "Saved Views"}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[22rem]" data-testid="explorer-saved-views-menu">
                <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  Save and reopen the current search, filters, and sort in one click.
                </p>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(event) => {
                  event.preventDefault();
                  openSaveDialog();
                }} data-testid="explorer-save-view-button">
                  <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
                  Save Current View
                </DropdownMenuItem>
                {activeSavedView && (
                  <div className="px-2 pt-2">
                    <Badge variant="secondary" className="w-fit text-[10px] uppercase tracking-wide">
                      Active: {activeSavedView.name}
                    </Badge>
                  </div>
                )}
                {savedViewsQuery.isError ? (
                  <p className="px-2 py-3 text-xs text-destructive">Could not load saved views right now.</p>
                ) : savedViews.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground" data-testid="explorer-saved-views-empty">
                    No saved views yet.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-1 overflow-y-auto p-1">
                    {savedViews.map((savedView) => {
                      const isActive = activeSavedView?.id === savedView.id;

                      return (
                        <div
                          key={savedView.id}
                          className={cn(
                            "flex items-start gap-2 rounded-md border px-2 py-2",
                            isActive ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/40",
                          )}
                          data-testid="explorer-saved-view-row"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            aria-label={`Open saved view ${savedView.name}`}
                            onClick={() => applySavedView(savedView)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">{savedView.name}</span>
                              {isActive && (
                                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="truncate pt-1 text-xs text-muted-foreground">{describeExplorerQuery(savedView.query)}</p>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
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
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={clearAllFilters} data-testid="vehicle-explorer-clear-filters">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear Filters
            </Button>
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => navigate("/auto-aging/exports")}>
                View Exports
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCreateSubscription()}
                disabled={!result || result.total === 0 || createExportSubscription.isPending}
              >
                <BellRing className="mr-1 h-3.5 w-3.5" />
                {createExportSubscription.isPending ? "Saving…" : "Save Daily Export"}
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={!result || result.total === 0 || createExport.isPending}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                {createExport.isPending ? "Queueing…" : "Request CSV"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="vehicle-explorer-filter-chips">
          {presetLabel && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              Preset: {presetLabel}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-primary/10"
                onClick={() => updateQuery((current) => ({ ...current, preset: undefined, page: 1 }))}
                aria-label="Clear preset"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filterTokens.length > 0 ? filterTokens.map((token) => (
            <Badge key={token} variant="secondary" className="text-[11px]">
              {token}
            </Badge>
          )) : (
            <span className="text-xs text-muted-foreground">Use column headers to filter this sheet.</span>
          )}
        </div>

        {result && (
          <div
            className="flex flex-col gap-3 border-t border-border/50 pt-3 xl:flex-row xl:items-center xl:justify-between"
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
                Rows
              </label>
              <select
                id="vehicle-explorer-page-size"
                data-testid="vehicle-explorer-page-size"
                value={query.pageSize}
                onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                className="h-8 rounded-md border border-border bg-secondary px-3 text-xs text-foreground"
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
                onClick={() => handlePageChange(query.page - 1)}
                disabled={query.page === 1}
                data-testid="vehicle-explorer-previous-page-top"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(query.page + 1)}
                disabled={query.page >= totalPages}
                data-testid="vehicle-explorer-next-page-top"
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading vehicles...</div>}

      {result && (
      <VehicleExplorerGrid
          rows={result.items}
          columns={result.columns}
          mappings={mappings}
          query={query}
          filterApi={filterApi}
          onToggleSort={toggleSort}
          onOpenVehicle={(chassisNo) => navigate(`/auto-aging/vehicles/${chassisNo}`)}
          onSaveCorrections={async (chassisNo, input) => {
            await updateCorrections.mutateAsync({ chassisNo, input });
          }}
          savingCorrections={updateCorrections.isPending}
      />
      )}

      {result && (
        <div
          className="glass-panel flex flex-col gap-3 border-t border-border/50 px-4 py-4"
          data-testid="vehicle-explorer-pagination-bottom"
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-xs text-muted-foreground">{formatExplorerRange(result.total, result.page, result.pageSize)}</div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={query.page === 1}
                data-testid="vehicle-explorer-first-page"
              >
                <ChevronsLeft className="mr-1 h-3.5 w-3.5" />
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(query.page - 1)}
                disabled={query.page === 1}
                data-testid="vehicle-explorer-previous-page"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>

              {paginationItems.map((item) => {
                if (typeof item !== "number") {
                  return (
                    <span key={item} className="px-2 text-xs text-muted-foreground">
                      …
                    </span>
                  );
                }

                return (
                  <Button
                    key={item}
                    variant={item === query.page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(item)}
                    aria-current={item === query.page ? "page" : undefined}
                    data-testid={`vehicle-explorer-page-${item}`}
                  >
                    {item}
                  </Button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(query.page + 1)}
                disabled={query.page >= totalPages}
                data-testid="vehicle-explorer-next-page"
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={query.page >= totalPages}
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
            <Input
              id="vehicle-explorer-page-jump"
              data-testid="vehicle-explorer-page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              className="h-8 w-20 text-xs"
            />
            <Button type="submit" variant="outline" size="sm">
              Go
            </Button>
            <span className="text-xs text-muted-foreground">Max page: {totalPages}</span>
          </form>
        </div>
      )}

      <Dialog
        open={isSaveDialogOpen}
        onOpenChange={(open) => {
          setIsSaveDialogOpen(open);
          if (!open) {
            setSavedViewName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Explorer View</DialogTitle>
            <DialogDescription>
              Save the current search, filters, and sort so you can reopen the same slice later.
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
                : "Remove this saved explorer view? This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSavedView.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteSavedView()}
              disabled={deleteSavedView.isPending}
              data-testid="explorer-saved-view-delete-confirm"
            >
              {deleteSavedView.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
