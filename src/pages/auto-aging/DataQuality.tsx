import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useQualityIssues } from '@/hooks/api/use-platform';

export default function DataQuality() {
  const { data, error, isError, isLoading, refetch } = useQualityIssues();
  const qualityIssues = data?.items ?? [];

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

  const byType = qualityIssues.reduce((acc, i) => {
    acc[i.issueType] = (acc[i.issueType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Data Quality"
        description={`${qualityIssues.length} issues detected across all imports`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Data Quality' }]}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {qualityIssues.length === 0 && (
          <div className="glass-panel col-span-full p-6 text-sm text-muted-foreground">
            No data quality issues detected yet.
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
        <table className="w-full text-sm">
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
            {qualityIssues.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Import a workbook to start capturing validation issues.
                </td>
              </tr>
            )}
            {qualityIssues.map(issue => (
              <tr key={issue.id} className="data-table-row">
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
