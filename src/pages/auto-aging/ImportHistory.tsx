import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useImports } from '@/hooks/api/use-platform';

export default function ImportHistory() {
  const { data, error, isError, isLoading, refetch } = useImports();
  const importBatches = data?.items ?? [];

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading import history...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Import History"
          description="Track all data import operations"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import History' }]}
        />
        <QueryErrorState
          title="Could not load import history"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import History"
        description="Track all data import operations"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import History' }]}
      />

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">File</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Uploaded By</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Date</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Mode</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Rows</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Valid</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {importBatches.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No import jobs have been uploaded yet.
                </td>
              </tr>
            )}
            {importBatches.map(b => (
              <tr key={b.id} className="data-table-row">
                <td className="px-4 py-3 text-primary text-xs font-medium">{b.fileName}</td>
                <td className="px-4 py-3 text-foreground">{b.uploadedBy}</td>
                <td className="px-4 py-3 text-foreground text-xs">{new Date(b.uploadedAt).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {b.publishMode ? b.publishMode.toUpperCase() : '—'}
                </td>
                <td className="px-4 py-3 text-foreground tabular-nums">{b.totalRows}</td>
                <td className="px-4 py-3 text-success tabular-nums">{b.validRows}</td>
                <td className="px-4 py-3 text-destructive tabular-nums">{b.errorRows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
