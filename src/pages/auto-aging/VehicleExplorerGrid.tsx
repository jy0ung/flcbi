import React from "react";
import {
  VEHICLE_CORRECTION_EDITOR_ROLES,
  type ExplorerMappingsResponse,
  type ExplorerQuery,
  type UpdateVehicleCorrectionsRequest,
  type WorkbookExplorerColumn,
  type WorkbookExplorerRow,
} from "@flcbi/contracts";
import {
  Check,
  Filter,
  Pencil,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildVehicleCorrectionDraft,
  buildVehicleCorrectionUpdate,
  VEHICLE_CORRECTION_DATE_FIELDS,
  VEHICLE_CORRECTION_EDIT_FIELDS,
  VEHICLE_CORRECTION_SELECT_FIELDS,
  type VehicleCorrectionDraft,
} from "@/lib/vehicle-corrections-form";
import { type ExplorerFilterApi } from "@/lib/explorer-filters";
import { cn } from "@/lib/utils";

interface VehicleExplorerGridProps {
  rows: WorkbookExplorerRow[];
  columns: WorkbookExplorerColumn[];
  mappings?: ExplorerMappingsResponse | null;
  query: ExplorerQuery;
  filterApi: ExplorerFilterApi;
  onToggleSort: (field: string) => void;
  onOpenVehicle: (chassisNo: string) => void;
  onSaveCorrections: (chassisNo: string, input: UpdateVehicleCorrectionsRequest) => Promise<void>;
  savingCorrections: boolean;
}

type ColumnFilterAlign = "start" | "end";
type EditableField = typeof VEHICLE_CORRECTION_EDIT_FIELDS[number];

const STICKY_LEFT_OFFSETS: Record<string, number> = {
  chassis_no: 0,
  branch_code: 160,
  model: 300,
};

function toKebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function filterTriggerTestId(columnKey: string) {
  return `vehicle-explorer-filter-trigger-${toKebabCase(columnKey)}`;
}

function filterPopoverTestId(columnKey: string) {
  return `vehicle-explorer-filter-popover-${toKebabCase(columnKey)}`;
}

function filterControlTestId(columnKey: string, suffix: string) {
  return `vehicle-explorer-filter-${toKebabCase(columnKey)}-${suffix}`;
}

function getCellValue(row: WorkbookExplorerRow, key: string) {
  if (key in row) {
    return (row as Record<string, string | number | boolean | null | undefined>)[key];
  }

  return row.source_values?.[key];
}

function formatCellValue(value: string | number | boolean | null | undefined, kind: WorkbookExplorerColumn["kind"]) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (kind === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function buildDisplayOptions(
  column: WorkbookExplorerColumn,
  mappings?: ExplorerMappingsResponse | null,
) {
  const options = new Map<string, string>();

  if (column.key === "branch_code") {
    for (const item of mappings?.branches ?? []) {
      const label = item.branchName ? `${item.rawValue} - ${item.branchName}` : item.rawValue;
      options.set(item.rawValue, label);
    }
  } else if (column.key === "payment_method") {
    for (const item of mappings?.payments ?? []) {
      const label = item.canonicalValue || item.rawValue;
      options.set(item.canonicalValue, label);
    }
  }

  for (const option of column.options ?? []) {
    if (!options.has(option)) {
      options.set(option, option);
    }
  }

  return [...options.entries()].map(([value, label]) => ({ value, label }));
}

function isEditableField(field: string): field is EditableField {
  return VEHICLE_CORRECTION_EDIT_FIELDS.includes(field as EditableField);
}

function FilterPopoverShell({
  title,
  active,
  open,
  setOpen,
  align = "start",
  columnKey,
  children,
}: {
  title: string;
  active: boolean;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  align?: ColumnFilterAlign;
  columnKey: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 shrink-0", active && "bg-primary/10 text-primary hover:bg-primary/15")}
          aria-label={`Filter ${title}`}
          aria-pressed={active}
          data-testid={filterTriggerTestId(columnKey)}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} className="w-80" data-testid={filterPopoverTestId(columnKey)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function TextFilterPopover({
  title,
  columnKey,
  value,
  placeholder,
  active,
  onApply,
  onClear,
  align = "start",
}: {
  title: string;
  columnKey: string;
  value: string;
  placeholder: string;
  active: boolean;
  onApply: (value: string) => void;
  onClear: () => void;
  align?: ColumnFilterAlign;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  return (
    <FilterPopoverShell title={title} active={active} open={open} setOpen={setOpen} align={align} columnKey={columnKey}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="space-y-2">
          <label htmlFor={filterControlTestId(columnKey, "input")} className="text-xs font-medium text-muted-foreground">
            {title}
          </label>
          <Input
            id={filterControlTestId(columnKey, "input")}
            data-testid={filterControlTestId(columnKey, "input")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft("");
              onClear();
            }}
            data-testid={filterControlTestId(columnKey, "clear")}
          >
            Clear
          </Button>
          <Button type="submit" size="sm" data-testid={filterControlTestId(columnKey, "apply")}>
            Apply
          </Button>
        </div>
      </form>
    </FilterPopoverShell>
  );
}

function SelectFilterPopover({
  title,
  columnKey,
  value,
  active,
  options,
  allLabel,
  onApply,
  onClear,
  align = "start",
}: {
  title: string;
  columnKey: string;
  value: string;
  active: boolean;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  onApply: (value: string) => void;
  onClear: () => void;
  align?: ColumnFilterAlign;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  return (
    <FilterPopoverShell title={title} active={active} open={open} setOpen={setOpen} align={align} columnKey={columnKey}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="space-y-2">
          <label htmlFor={filterControlTestId(columnKey, "select")} className="text-xs font-medium text-muted-foreground">
            {title}
          </label>
          <select
            id={filterControlTestId(columnKey, "select")}
            data-testid={filterControlTestId(columnKey, "select")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
            className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground"
            autoFocus
          >
            <option value="all">{allLabel}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft("all");
              onClear();
            }}
            data-testid={filterControlTestId(columnKey, "clear")}
          >
            Clear
          </Button>
          <Button type="submit" size="sm" data-testid={filterControlTestId(columnKey, "apply")}>
            Apply
          </Button>
        </div>
      </form>
    </FilterPopoverShell>
  );
}

function BooleanFilterPopover({
  title,
  columnKey,
  value,
  active,
  onApply,
  onClear,
  align = "start",
}: {
  title: string;
  columnKey: string;
  value: string;
  active: boolean;
  onApply: (value: string) => void;
  onClear: () => void;
  align?: ColumnFilterAlign;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  return (
    <FilterPopoverShell title={title} active={active} open={open} setOpen={setOpen} align={align} columnKey={columnKey}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="space-y-2">
          <label htmlFor={filterControlTestId(columnKey, "select")} className="text-xs font-medium text-muted-foreground">
            {title}
          </label>
          <select
            id={filterControlTestId(columnKey, "select")}
            data-testid={filterControlTestId(columnKey, "select")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
            className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground"
            autoFocus
          >
            <option value="all">All Values</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft("all");
              onClear();
            }}
            data-testid={filterControlTestId(columnKey, "clear")}
          >
            Clear
          </Button>
          <Button type="submit" size="sm" data-testid={filterControlTestId(columnKey, "apply")}>
            Apply
          </Button>
        </div>
      </form>
    </FilterPopoverShell>
  );
}

function DateRangePopover({
  title,
  columnKey,
  value,
  active,
  onApply,
  onClear,
  align = "start",
}: {
  title: string;
  columnKey: string;
  value: { from?: string; to?: string };
  active: boolean;
  onApply: (value: { from?: string; to?: string }) => void;
  onClear: () => void;
  align?: ColumnFilterAlign;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ from: string; to: string }>({
    from: value.from ?? "",
    to: value.to ?? "",
  });

  React.useEffect(() => {
    if (open) {
      setDraft({ from: value.from ?? "", to: value.to ?? "" });
    }
  }, [open, value.from, value.to]);

  const apply = () => {
    onApply({
      from: draft.from.trim() || undefined,
      to: draft.to.trim() || undefined,
    });
    setOpen(false);
  };

  return (
    <FilterPopoverShell title={title} active={active} open={open} setOpen={setOpen} align={align} columnKey={columnKey}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={filterControlTestId(columnKey, "from")} className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              id={filterControlTestId(columnKey, "from")}
              data-testid={filterControlTestId(columnKey, "from")}
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={filterControlTestId(columnKey, "to")} className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              id={filterControlTestId(columnKey, "to")}
              data-testid={filterControlTestId(columnKey, "to")}
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft({ from: "", to: "" });
              onClear();
            }}
            data-testid={filterControlTestId(columnKey, "clear")}
          >
            Clear
          </Button>
          <Button type="submit" size="sm" data-testid={filterControlTestId(columnKey, "apply")}>
            Apply
          </Button>
        </div>
      </form>
    </FilterPopoverShell>
  );
}

function NumberRangePopover({
  title,
  columnKey,
  value,
  active,
  onApply,
  onClear,
  align = "start",
}: {
  title: string;
  columnKey: string;
  value: { min?: number; max?: number };
  active: boolean;
  onApply: (value: { min?: string; max?: string }) => void;
  onClear: () => void;
  align?: ColumnFilterAlign;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ min: string; max: string }>({
    min: value.min != null ? String(value.min) : "",
    max: value.max != null ? String(value.max) : "",
  });

  React.useEffect(() => {
    if (open) {
      setDraft({ min: value.min != null ? String(value.min) : "", max: value.max != null ? String(value.max) : "" });
    }
  }, [open, value.max, value.min]);

  const apply = () => {
    onApply({
      min: draft.min.trim() || undefined,
      max: draft.max.trim() || undefined,
    });
    setOpen(false);
  };

  return (
    <FilterPopoverShell title={title} active={active} open={open} setOpen={setOpen} align={align} columnKey={columnKey}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={filterControlTestId(columnKey, "min")} className="text-xs font-medium text-muted-foreground">
              Minimum
            </label>
            <Input
              id={filterControlTestId(columnKey, "min")}
              data-testid={filterControlTestId(columnKey, "min")}
              type="number"
              value={draft.min}
              onChange={(event) => setDraft((current) => ({ ...current, min: event.target.value }))}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={filterControlTestId(columnKey, "max")} className="text-xs font-medium text-muted-foreground">
              Maximum
            </label>
            <Input
              id={filterControlTestId(columnKey, "max")}
              data-testid={filterControlTestId(columnKey, "max")}
              type="number"
              value={draft.max}
              onChange={(event) => setDraft((current) => ({ ...current, max: event.target.value }))}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft({ min: "", max: "" });
              onClear();
            }}
            data-testid={filterControlTestId(columnKey, "clear")}
          >
            Clear
          </Button>
          <Button type="submit" size="sm" data-testid={filterControlTestId(columnKey, "apply")}>
            Apply
          </Button>
        </div>
      </form>
    </FilterPopoverShell>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  onKeyDown,
  disabled,
  options,
}: {
  field: EditableField;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLSelectElement>;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
}) {
  const isSelectField = VEHICLE_CORRECTION_SELECT_FIELDS.includes(field);
  const isDateField = VEHICLE_CORRECTION_DATE_FIELDS.includes(field);
  const selectOptions = React.useMemo(() => {
    if (!isSelectField) {
      return options ?? [];
    }

    const currentValue = value.trim();
    const merged = new Map<string, string>();
    if (currentValue) {
      merged.set(currentValue, currentValue);
    }
    for (const option of options ?? []) {
      merged.set(option.value, option.label);
    }
    return [...merged.entries()].map(([optionValue, optionLabel]) => ({
      value: optionValue,
      label: optionLabel,
    }));
  }, [isSelectField, options, value]);

  if (isSelectField) {
    return (
      <select
        data-testid={`vehicle-explorer-edit-select-${field}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground"
      >
        <option value="">{field === "branch_code" ? "Select branch" : "Select payment"}</option>
        {selectOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      data-testid={`vehicle-explorer-edit-input-${field}`}
      type={isDateField ? "date" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      required={field !== "remark"}
      className={cn(
        "h-8 rounded-md text-xs",
        field === "remark" ? "min-w-[240px]" : "min-w-[160px]",
      )}
    />
  );
}

export function VehicleExplorerGrid({
  rows,
  columns,
  mappings,
  query,
  filterApi,
  onToggleSort,
  onOpenVehicle,
  onSaveCorrections,
  savingCorrections,
}: VehicleExplorerGridProps) {
  const { hasRole } = useAuth();
  const canEditCorrections = hasRole(VEHICLE_CORRECTION_EDITOR_ROLES);
  const [editingChassisNo, setEditingChassisNo] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<VehicleCorrectionDraft>(buildVehicleCorrectionDraft());
  const [reason, setReason] = React.useState("");
  const [savingChassisNo, setSavingChassisNo] = React.useState<string | null>(null);

  const editingRow = React.useMemo(
    () => rows.find((row) => row.chassis_no === editingChassisNo) ?? null,
    [editingChassisNo, rows],
  );

  const branchEditOptions = React.useMemo(
    () => (mappings?.branches ?? []).map((item) => ({
      value: item.rawValue,
      label: item.branchName ? `${item.rawValue} - ${item.branchName}` : item.rawValue,
    })),
    [mappings],
  );
  const paymentEditOptions = React.useMemo(
    () => (mappings?.paymentOptions ?? []).map((item) => ({
      value: item.value,
      label: item.label,
    })),
    [mappings],
  );

  React.useEffect(() => {
    if (!editingChassisNo) {
      return;
    }

    if (!editingRow) {
      setEditingChassisNo(null);
      setDraft(buildVehicleCorrectionDraft());
      setReason("");
    }
  }, [editingChassisNo, editingRow]);

  const beginEdit = (row: WorkbookExplorerRow) => {
    setEditingChassisNo(row.chassis_no);
    setDraft(buildVehicleCorrectionDraft(row));
    setReason("");
  };

  const cancelEdit = () => {
    setEditingChassisNo(null);
    setDraft(buildVehicleCorrectionDraft());
    setReason("");
  };

  const updateDraftField = (field: EditableField, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!editingRow) {
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      toast.error("Please add a short reason for the correction.");
      return;
    }

    const { input, changedCount } = buildVehicleCorrectionUpdate(editingRow, draft, trimmedReason);
    if (changedCount === 0) {
      toast.info("No vehicle changes to save.");
      return;
    }

    setSavingChassisNo(editingRow.chassis_no);
    try {
      await onSaveCorrections(editingRow.chassis_no, input);
      toast.success("Vehicle corrections saved.");
      cancelEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save vehicle corrections";
      toast.error(message);
    } finally {
      setSavingChassisNo(null);
    }
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSave();
    }
  };

  const renderFilterPopover = (column: WorkbookExplorerColumn) => {
    const filterValue = query.filters?.columnFilters?.[column.key];
    const active = filterValue !== undefined;

    switch (column.kind) {
      case "text":
        return (
          <TextFilterPopover
            title={column.label}
            columnKey={column.key}
            value={typeof filterValue === "string" ? filterValue : ""}
            placeholder={`Contains ${column.label.toLowerCase()}...`}
            active={active}
            onApply={(value) => filterApi.updateColumnFilter(column.key, value.trim() || undefined)}
            onClear={() => filterApi.updateColumnFilter(column.key, undefined)}
          />
        );
      case "select":
        return (
          <SelectFilterPopover
            title={column.label}
            columnKey={column.key}
            value={typeof filterValue === "string" ? filterValue : "all"}
            active={active}
            options={buildDisplayOptions(column, mappings)}
            allLabel={`All ${column.label}`}
            onApply={(value) => filterApi.updateColumnFilter(column.key, value === "all" ? undefined : value)}
            onClear={() => filterApi.updateColumnFilter(column.key, undefined)}
          />
        );
      case "boolean":
        return (
          <BooleanFilterPopover
            title={column.label}
            columnKey={column.key}
            value={typeof filterValue === "boolean" ? String(filterValue) : "all"}
            active={active}
            onApply={(value) => filterApi.updateColumnFilter(column.key, value === "all" ? undefined : value === "true")}
            onClear={() => filterApi.updateColumnFilter(column.key, undefined)}
          />
        );
      case "date":
        return (
          <DateRangePopover
            title={column.label}
            columnKey={column.key}
            value={filterValue && typeof filterValue === "object" && !Array.isArray(filterValue)
              ? filterValue as { from?: string; to?: string }
              : {}}
            active={active}
            onApply={(value) => filterApi.updateColumnFilter(column.key, value)}
            onClear={() => filterApi.updateColumnFilter(column.key, undefined)}
          />
        );
      case "number":
        return (
          <NumberRangePopover
            title={column.label}
            columnKey={column.key}
            value={filterValue && typeof filterValue === "object" && !Array.isArray(filterValue)
              ? filterValue as { min?: number; max?: number }
              : {}}
            active={active}
            onApply={(value) => filterApi.updateColumnFilter(column.key, value)}
            onClear={() => filterApi.updateColumnFilter(column.key, undefined)}
          />
        );
      default:
        return null;
    }
  };

  const displayColumns = columns.filter((column) => column.key !== "source_headers" && column.key !== "source_values");

  const getEditingOptions = (field: EditableField) => {
    if (field === "branch_code") {
      return branchEditOptions;
    }
    if (field === "payment_method") {
      return paymentEditOptions;
    }
    return undefined;
  };

  const renderCellContent = (row: WorkbookExplorerRow, column: WorkbookExplorerColumn, isEditing: boolean) => {
    const field = column.key;
    const value = getCellValue(row, field);
    const draftValue = (draft as Record<string, string | undefined>)[field] ?? "";

    if (isEditing && isEditableField(field)) {
      return (
        <FieldEditor
          field={field}
          value={draftValue}
          onChange={(nextValue) => updateDraftField(field, nextValue)}
          onKeyDown={handleEditorKeyDown}
          disabled={savingCorrections || savingChassisNo === row.chassis_no}
          options={getEditingOptions(field)}
        />
      );
    }

    if (column.kind === "boolean") {
      return (
        <span className={cn("text-xs font-medium", value ? "text-warning" : "text-muted-foreground")}>
          {formatCellValue(value, column.kind)}
        </span>
      );
    }

    if (column.kind === "number") {
      return <span className="tabular-nums">{formatCellValue(value, column.kind)}</span>;
    }

    if (field === "remark") {
      return <span className="text-muted-foreground">{formatCellValue(value, column.kind)}</span>;
    }

    return (
      <span className={field === "chassis_no" ? "font-mono text-xs text-primary" : undefined}>
        {formatCellValue(value, column.kind)}
      </span>
    );
  };

  if (rows.length === 0) {
    return (
      <div className="glass-panel p-10 text-center text-sm text-muted-foreground">
        No vehicles match the current filters yet.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="max-h-[calc(100vh-28rem)] overflow-auto">
        <table className="min-w-[2400px] table-fixed text-sm" style={{ minWidth: `${Math.max(2400, displayColumns.length * 120)}px` }}>
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-border bg-secondary/30 text-left">
              {displayColumns.map((column) => {
                const isSorted = query.sortField === column.key;
                const stickyLeft = column.sticky === "left";
                const stickyStyles = stickyLeft
                  ? {
                      position: "sticky" as const,
                      left: `${STICKY_LEFT_OFFSETS[column.key] ?? 0}px`,
                      zIndex: 30,
                    }
                  : column.sticky === "right"
                    ? { position: "sticky" as const, right: "0px", zIndex: 30 }
                    : undefined;

                return (
                  <th
                    key={column.key}
                    style={stickyStyles}
                    className={cn(
                      "border-b border-border/60 px-3 py-3 text-xs font-medium text-muted-foreground",
                      column.width,
                      stickyLeft || column.sticky === "right" ? "bg-secondary/95 backdrop-blur" : "bg-secondary/30",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleSort(column.key)}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium text-muted-foreground transition hover:text-foreground"
                        data-testid={`vehicle-explorer-sort-${column.key}`}
                      >
                        <span className="truncate">{column.label}</span>
                        {isSorted && <span>{query.sortDirection === "desc" ? "↓" : "↑"}</span>}
                      </button>
                      {column.filterable !== false && <div className="shrink-0">{renderFilterPopover(column)}</div>}
                    </div>
                  </th>
                );
              })}
              <th
                className="sticky right-0 z-30 border-b border-border/60 bg-secondary/95 px-3 py-3 text-xs font-medium text-muted-foreground backdrop-blur min-w-[112px]"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {displayColumns.length > 0 && rows.map((row) => {
              const isEditing = editingChassisNo === row.chassis_no;
              const rowDraft = isEditing ? draft : buildVehicleCorrectionDraft(row);

              return (
                <React.Fragment key={row.id}>
                  <tr
                    className={cn("data-table-row", !isEditing && "cursor-pointer", isEditing && "bg-primary/5")}
                    onClick={() => {
                      if (!isEditing) {
                        onOpenVehicle(row.chassis_no);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isEditing) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenVehicle(row.chassis_no);
                      }
                    }}
                    role={!isEditing ? "button" : undefined}
                    tabIndex={!isEditing ? 0 : undefined}
                    aria-label={`Open vehicle detail for ${row.chassis_no}`}
                    data-testid="vehicle-explorer-row"
                  >
                    {displayColumns.map((column) => {
                      const stickyLeft = column.sticky === "left";
                      const stickyStyles = stickyLeft
                        ? {
                            position: "sticky" as const,
                            left: `${STICKY_LEFT_OFFSETS[column.key] ?? 0}px`,
                            zIndex: 20,
                          }
                        : column.sticky === "right"
                          ? { position: "sticky" as const, right: "0px", zIndex: 20 }
                          : undefined;

                      return (
                        <td
                          key={`${row.id}-${column.key}`}
                          style={stickyStyles}
                          className={cn(
                            "px-3 py-2 align-middle",
                            column.width,
                            stickyLeft || column.sticky === "right" ? "bg-card/95 backdrop-blur" : "bg-card/60",
                          )}
                        >
                          {renderCellContent(row, column, isEditing)}
                        </td>
                      );
                    })}
                    <td
                      className="sticky right-0 z-20 bg-card/95 px-3 py-2 align-middle backdrop-blur min-w-[112px]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {!isEditing ? (
                        canEditCorrections && row.canEditCorrections ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => beginEdit(row)}
                            disabled={savingCorrections}
                            data-testid="vehicle-explorer-edit-button"
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => void handleSave()}
                            disabled={savingCorrections || savingChassisNo === row.chassis_no}
                            data-testid="vehicle-explorer-save-button"
                          >
                            {savingCorrections || savingChassisNo === row.chassis_no ? (
                              <RotateCcw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1 h-3.5 w-3.5" />
                            )}
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={savingCorrections || savingChassisNo === row.chassis_no}
                            data-testid="vehicle-explorer-cancel-button"
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {isEditing && editingRow?.chassis_no === row.chassis_no && (
                    <tr className="border-b border-border/50 bg-background/80">
                      <td colSpan={displayColumns.length + 1} className="px-3 py-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor={`vehicle-explorer-reason-${row.chassis_no}`}>
                              Reason for change
                            </label>
                            <Input
                              id={`vehicle-explorer-reason-${row.chassis_no}`}
                              data-testid="vehicle-explorer-reason-input"
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              onKeyDown={handleEditorKeyDown}
                              disabled={savingCorrections || savingChassisNo === row.chassis_no}
                              placeholder="Describe why these corrections are needed"
                              className="h-8 text-xs"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Edit cells inline, then press Enter to save or Escape to cancel.
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground lg:text-right">
                            {VEHICLE_CORRECTION_EDIT_FIELDS.some((field) => {
                              const next = (rowDraft[field] ?? "").trim();
                              const current = (buildVehicleCorrectionDraft(row)[field] ?? "").trim();
                              return next !== current;
                            }) ? (
                              <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">
                                <Check className="h-3.5 w-3.5" />
                                Unsaved changes
                              </span>
                            ) : (
                              <span>No field changes yet.</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
