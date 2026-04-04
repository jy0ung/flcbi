import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useNotifications } from '@/hooks/api/use-platform';

export default function Notifications() {
  const { data, error, isError, isLoading, refetch } = useNotifications();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading notifications...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Notifications" description="System alerts and updates" />
        <QueryErrorState
          title="Could not load notifications"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Notifications" description="System alerts and updates" />
      <div className="space-y-2">
        {(data?.items.length ?? 0) === 0 && (
          <div className="glass-panel p-6 text-sm text-muted-foreground">
            No notifications yet. Alerts and import updates will appear here once the platform is active.
          </div>
        )}
        {data?.items.map(n => (
          <div key={n.id} className={`glass-panel p-4 flex items-start gap-3 ${!n.read ? 'border-l-2 border-primary' : ''}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">{n.title}</span>
                <StatusBadge status={n.type} />
              </div>
              <p className="text-xs text-muted-foreground">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
