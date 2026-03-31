import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { demoNotifications } from '@/data/demo-data';

export default function Notifications() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Notifications" description="System alerts and updates" />
      <div className="space-y-2">
        {demoNotifications.map(n => (
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
