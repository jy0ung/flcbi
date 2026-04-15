import React from "react";
import type {
  ExplorerMappingsBranchOption,
  ExplorerMappingsPaymentOption,
  UpdateExplorerMappingsRequest,
} from "@flcbi/contracts";
import { Loader2, RefreshCcw, Save, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useExplorerMappings, useSaveExplorerMappings } from "@/hooks/api/use-platform";

type BranchDraft = ExplorerMappingsBranchOption;
type PaymentDraft = ExplorerMappingsPaymentOption;

function toKebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
}

function mergeOptions(
  currentValue: string,
  options: Array<{ value: string; label: string }>,
) {
  const merged = new Map<string, string>();
  const trimmedValue = currentValue.trim();
  if (trimmedValue) {
    merged.set(trimmedValue, trimmedValue);
  }

  for (const option of options) {
    merged.set(option.value, option.label);
  }

  return [...merged.entries()].map(([value, label]) => ({ value, label }));
}

function isBranchDirty(original: BranchDraft | undefined, next: BranchDraft) {
  if (!original) {
    return true;
  }

  return original.branchId !== next.branchId || original.approved !== next.approved;
}

function isPaymentDirty(original: PaymentDraft | undefined, next: PaymentDraft) {
  if (!original) {
    return true;
  }

  return original.canonicalValue !== next.canonicalValue || original.approved !== next.approved;
}

function statusBadges(sourceCount: number, approved: boolean, suggested: boolean) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
        {sourceCount} source{sourceCount === 1 ? "" : "s"}
      </Badge>
      <Badge variant={approved ? "default" : "outline"} className="text-[10px] uppercase tracking-wide">
        {approved ? "Approved" : "Draft"}
      </Badge>
      {suggested && (
        <Badge variant="secondary" className="bg-emerald-500/10 text-[10px] uppercase tracking-wide text-emerald-600">
          Suggested
        </Badge>
      )}
    </div>
  );
}

export default function MappingAdmin() {
  const { data, error, isError, isLoading, refetch } = useExplorerMappings();
  const saveMappings = useSaveExplorerMappings();
  const mappings = data;
  const [search, setSearch] = React.useState("");
  const [branchDrafts, setBranchDrafts] = React.useState<BranchDraft[]>([]);
  const [paymentDrafts, setPaymentDrafts] = React.useState<PaymentDraft[]>([]);

  React.useEffect(() => {
    if (!mappings) {
      return;
    }

    setBranchDrafts(mappings.branches.map((item) => ({ ...item })));
    setPaymentDrafts(mappings.payments.map((item) => ({ ...item })));
  }, [mappings]);

  const branchOptions = mappings?.branchOptions ?? [];
  const paymentOptions = mappings?.paymentOptions ?? [];

  const branchOriginals = React.useMemo(
    () => new Map((mappings?.branches ?? []).map((item) => [item.rawValue, item] as const)),
    [mappings],
  );
  const paymentOriginals = React.useMemo(
    () => new Map((mappings?.payments ?? []).map((item) => [item.rawValue, item] as const)),
    [mappings],
  );

  const filteredBranchDrafts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return branchDrafts;
    }

    return branchDrafts.filter((branch) => {
      const text = [
        branch.rawValue,
        branch.branchId,
        branch.branchCode,
        branch.branchName,
        branch.approved ? "approved" : "draft",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
  }, [branchDrafts, search]);

  const filteredPaymentDrafts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return paymentDrafts;
    }

    return paymentDrafts.filter((payment) => {
      const text = [
        payment.rawValue,
        payment.canonicalValue,
        payment.approved ? "approved" : "draft",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
  }, [paymentDrafts, search]);

  const dirtyBranchCount = React.useMemo(
    () => branchDrafts.filter((item) => isBranchDirty(branchOriginals.get(item.rawValue), item)).length,
    [branchDrafts, branchOriginals],
  );
  const dirtyPaymentCount = React.useMemo(
    () => paymentDrafts.filter((item) => isPaymentDirty(paymentOriginals.get(item.rawValue), item)).length,
    [paymentDrafts, paymentOriginals],
  );

  const dirtyCount = dirtyBranchCount + dirtyPaymentCount;

  const updateBranchDraft = React.useCallback((rawValue: string, updater: (current: BranchDraft) => BranchDraft) => {
    setBranchDrafts((current) => current.map((item) => (item.rawValue === rawValue ? updater(item) : item)));
  }, []);

  const updatePaymentDraft = React.useCallback((rawValue: string, updater: (current: PaymentDraft) => PaymentDraft) => {
    setPaymentDrafts((current) => current.map((item) => (item.rawValue === rawValue ? updater(item) : item)));
  }, []);

  const handleSave = async () => {
    const branches = branchDrafts
      .filter((item) => isBranchDirty(branchOriginals.get(item.rawValue), item))
      .map((item) => ({
        rawValue: item.rawValue,
        branchId: item.branchId,
        approved: item.approved,
      }));
    const payments = paymentDrafts
      .filter((item) => isPaymentDirty(paymentOriginals.get(item.rawValue), item))
      .map((item) => ({
        rawValue: item.rawValue,
        canonicalValue: item.canonicalValue,
        approved: item.approved,
      }));

    if (branches.length === 0 && payments.length === 0) {
      toast.info("No mapping changes to save.");
      return;
    }

    const input: UpdateExplorerMappingsRequest = {};
    if (branches.length > 0) {
      input.branches = branches;
    }
    if (payments.length > 0) {
      input.payments = payments;
    }

    try {
      const response = await saveMappings.mutateAsync(input);
      toast.success(
        `Updated ${branches.length} branch mapping${branches.length === 1 ? "" : "s"} and ${payments.length} payment mapping${payments.length === 1 ? "" : "s"}.`,
      );
      setBranchDrafts(response.branches.map((item) => ({ ...item })));
      setPaymentDrafts(response.payments.map((item) => ({ ...item })));
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save mappings");
    }
  };

  const hasChanges = dirtyCount > 0;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading mapping console...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader
          title="Mapping Console"
          description="Manage branch and payment normalization"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Mappings" }]}
        />
        <QueryErrorState title="Could not load mapping console" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Mapping Console"
        description="Approve system suggestions for branch and payment normalization. Saving backfills existing workbook rows and canonical aging data."
        breadcrumbs={[{ label: "FLC BI" }, { label: "Auto Aging" }, { label: "Mappings" }]}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={saveMappings.isPending}>
              <RefreshCcw className="mr-1 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button onClick={() => void handleSave()} disabled={!hasChanges || saveMappings.isPending}>
              {saveMappings.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      />

      <div className="glass-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            System suggestions are ready to review
          </p>
          <p className="text-xs text-muted-foreground">
            Choose a canonical branch or payment value, approve it, and the platform will backfill existing rows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">Branch drafts: {branchDrafts.length}</Badge>
          <Badge variant="secondary">Payment drafts: {paymentDrafts.length}</Badge>
          <Badge variant={hasChanges ? "default" : "outline"}>{hasChanges ? `${dirtyCount} unsaved changes` : "Up to date"}</Badge>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Search mappings</p>
            <p className="text-xs text-muted-foreground">
              Filter by raw value, current mapping, suggestion, or approval status.
            </p>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search raw values, suggestions, or approval state..."
            className="h-9 w-full max-w-md text-xs"
          />
        </div>
      </div>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Branch Mappings</h3>
          <p className="text-xs text-muted-foreground">Raw workbook branch values mapped to canonical company branches.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Raw Value</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Suggestion</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Mapped To</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Approved</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBranchDrafts.map((branch) => {
                const suggestion = branch.suggestedBranchId
                  ? branchOptions.find((option) => option.value === branch.suggestedBranchId)?.label ?? branch.suggestedBranchId
                  : "No suggestion";
                const isSuggested = branch.suggestedBranchId != null && branch.branchId === branch.suggestedBranchId;

                return (
                  <tr key={branch.rawValue} className="data-table-row align-top" data-testid={`mapping-branch-row-${toKebabCase(branch.rawValue)}`}>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-foreground">{branch.rawValue}</p>
                        {branch.sourceCount > 0 && (
                          <p className="text-[11px] text-muted-foreground">{branch.sourceCount} uploaded row{branch.sourceCount === 1 ? "" : "s"}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-foreground">{suggestion}</span>
                        {branch.suggestedBranchId && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-fit"
                            onClick={() => updateBranchDraft(branch.rawValue, (current) => ({
                              ...current,
                              branchId: branch.suggestedBranchId ?? current.branchId,
                              approved: true,
                            }))}
                            disabled={!branch.suggestedBranchId}
                          >
                            Use suggestion
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={branch.branchId}
                        onChange={(event) => updateBranchDraft(branch.rawValue, (current) => ({
                          ...current,
                          branchId: event.target.value,
                        }))}
                        className="h-9 w-full max-w-[320px] rounded-md border border-border bg-background px-3 text-xs text-foreground"
                        data-testid={`mapping-branch-select-${toKebabCase(branch.rawValue)}`}
                      >
                        <option value="">Select branch</option>
                        {mergeOptions(branch.branchId, branchOptions).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={branch.approved}
                          onCheckedChange={(checked) => updateBranchDraft(branch.rawValue, (current) => ({
                            ...current,
                            approved: checked === true,
                          }))}
                          data-testid={`mapping-branch-approved-${toKebabCase(branch.rawValue)}`}
                        />
                        <span className="text-xs text-muted-foreground">Approve mapping</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {statusBadges(branch.sourceCount, branch.approved, isSuggested)}
                    </td>
                  </tr>
                );
              })}
              {filteredBranchDrafts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No branch mappings match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Payment Method Mappings</h3>
          <p className="text-xs text-muted-foreground">Raw workbook payment values mapped to canonical payment labels.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Raw Value</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Suggestion</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Mapped To</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Approved</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPaymentDrafts.map((payment) => {
                const suggestion = payment.suggestedCanonicalValue ?? "No suggestion";
                const isSuggested = payment.suggestedCanonicalValue != null && payment.canonicalValue === payment.suggestedCanonicalValue;

                return (
                  <tr key={payment.rawValue} className="data-table-row align-top" data-testid={`mapping-payment-row-${toKebabCase(payment.rawValue)}`}>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-foreground">{payment.rawValue}</p>
                        {payment.sourceCount > 0 && (
                          <p className="text-[11px] text-muted-foreground">{payment.sourceCount} uploaded row{payment.sourceCount === 1 ? "" : "s"}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-foreground">{suggestion}</span>
                        {payment.suggestedCanonicalValue && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-fit"
                            onClick={() => updatePaymentDraft(payment.rawValue, (current) => ({
                              ...current,
                              canonicalValue: payment.suggestedCanonicalValue ?? current.canonicalValue,
                              approved: true,
                            }))}
                          >
                            Use suggestion
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={payment.canonicalValue}
                        onChange={(event) => updatePaymentDraft(payment.rawValue, (current) => ({
                          ...current,
                          canonicalValue: event.target.value,
                        }))}
                        className="h-9 w-full max-w-[320px] rounded-md border border-border bg-background px-3 text-xs text-foreground"
                        data-testid={`mapping-payment-select-${toKebabCase(payment.rawValue)}`}
                      >
                        <option value="">Select payment method</option>
                        {mergeOptions(payment.canonicalValue, paymentOptions).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={payment.approved}
                          onCheckedChange={(checked) => updatePaymentDraft(payment.rawValue, (current) => ({
                            ...current,
                            approved: checked === true,
                          }))}
                          data-testid={`mapping-payment-approved-${toKebabCase(payment.rawValue)}`}
                        />
                        <span className="text-xs text-muted-foreground">Approve mapping</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {statusBadges(payment.sourceCount, payment.approved, isSuggested)}
                    </td>
                  </tr>
                );
              })}
              {filteredPaymentDrafts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No payment mappings match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="glass-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Backfill behavior</p>
          <p className="text-xs text-muted-foreground">
            Saving mappings updates existing raw workbook rows, explorer filters, and the aging modules that read the canonical data.
          </p>
        </div>
        <Button onClick={() => void handleSave()} disabled={!hasChanges || saveMappings.isPending} data-testid="mapping-admin-save">
          {saveMappings.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
