import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { useAuditEvents } from '@/hooks/api/use-platform';

export default function AuditLog() {
  const { data, error, isError, isLoading, refetch } = useAuditEvents();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading audit events...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Audit Log" description="Track all system actions" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Audit Log' }]} />
        <QueryErrorState
          title="Could not load audit events"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Audit Log" description="Track all system actions" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Audit Log' }]} />
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">User</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Details</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No audit events have been recorded yet.
                </td>
              </tr>
            )}
            {items.map(log => (
              <tr key={log.id} className="data-table-row">
                <td className="px-4 py-3 text-primary text-xs font-mono">{log.action}</td>
                <td className="px-4 py-3 text-foreground">{log.userName}</td>
                <td className="px-4 py-3 text-foreground">{log.details}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
