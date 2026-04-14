import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';
import { useQualityIssues } from '@/hooks/api/use-platform';

export default function DataQuality() {
  const navigate = useNavigate();
  const { data, error, isError, isLoading, refetch } = useQualityIssues();
  const qualityIssues = data?.items ?? [];
  const [issueTypeFilter, setIssueTypeFilter] = React.useState<string>('all');
  const [severityFilter, setSeverityFilter] = React.useState<string>('all');
  const [fieldFilter, setFieldFilter] = React.useState<string>('all');

  const issueTypes = React.useMemo(
    () => Array.from(new Set(qualityIssues.map((issue) => issue.issueType))).sort(),
    [qualityIssues],
  );
  const fields = React.useMemo(
    () => Array.from(new Set(qualityIssues.map((issue) => issue.field))).sort(),
    [qualityIssues],
  );

  const filteredIssues = React.useMemo(
    () => qualityIssues.filter((issue) => (
      (issueTypeFilter === 'all' || issue.issueType === issueTypeFilter) &&
      (severityFilter === 'all' || issue.severity === severityFilter) &&
      (fieldFilter === 'all' || issue.field === fieldFilter)
    )),
    [fieldFilter, issueTypeFilter, qualityIssues, severityFilter],
  );

  const hasActiveFilters = issueTypeFilter !== 'all' || severityFilter !== 'all' || fieldFilter !== 'all';

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading quality issues...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Data Quality"
          description="Validation issues across current datasets"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Data Quality' }]}
        />
        <QueryErrorState
          title="Could not load data quality issues"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const byType = filteredIssues.reduce((acc, i) => {
    acc[i.issueType] = (acc[i.issueType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleOpenVehicle = (chassisNo: string) => {
    navigate(`/auto-aging/vehicles/${chassisNo}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Data Quality"
        description={`${filteredIssues.length} issues shown from ${qualityIssues.length} total`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Data Quality' }]}
      />

      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={issueTypeFilter}
          onChange={(event) => setIssueTypeFilter(event.target.value)}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
          data-testid="quality-filter-type"
        >
          <option value="all">All Types</option>
          {issueTypes.map((type) => (
            <option key={type} value={type}>
              {type.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
          data-testid="quality-filter-severity"
        >
          <option value="all">All Severity</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <select
          value={fieldFilter}
          onChange={(event) => setFieldFilter(event.target.value)}
          className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
          data-testid="quality-filter-field"
        >
          <option value="all">All Fields</option>
          {fields.map((field) => (
            <option key={field} value={field}>
              {field.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIssueTypeFilter('all');
              setSeverityFilter('all');
              setFieldFilter('all');
            }}
            data-testid="quality-filter-clear"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear Filters
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredIssues.length} shown · {qualityIssues.length} total
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {filteredIssues.length === 0 && (
          <div className="glass-panel col-span-full p-6 text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'No data quality issues match the current filters.'
              : 'No data quality issues detected yet.'}
          </div>
        )}
        {Object.entries(byType).map(([type, count]) => (
          <div key={type} className="kpi-card text-center">
            <StatusBadge status={type} />
            <p className="text-2xl font-bold text-foreground mt-2">{count}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm" data-testid="quality-issues-table">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Chassis No.</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Field</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Issue</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Type</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Severity</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {hasActiveFilters ? 'No quality issues match the current filters.' : 'Import a workbook to start capturing validation issues.'}
                </td>
              </tr>
            )}
            {filteredIssues.map(issue => (
              <tr
                key={issue.id}
                className="data-table-row cursor-pointer hover:bg-secondary/40"
                role="button"
                tabIndex={0}
                aria-label={`Open vehicle detail for ${issue.chassisNo}`}
                data-testid="quality-issue-row"
                onClick={() => handleOpenVehicle(issue.chassisNo)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenVehicle(issue.chassisNo);
                  }
                }}
              >
                <td className="px-4 py-3 font-mono text-xs text-primary">{issue.chassisNo}</td>
                <td className="px-4 py-3 text-foreground">{issue.field}</td>
                <td className="px-4 py-3 text-foreground">{issue.message}</td>
                <td className="px-4 py-3"><StatusBadge status={issue.issueType} /></td>
                <td className="px-4 py-3"><StatusBadge status={issue.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
