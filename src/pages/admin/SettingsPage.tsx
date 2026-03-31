import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { demoCompany } from '@/data/demo-data';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" description="Platform and company configuration" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Settings' }]} />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Company Information</h3>
          <div className="space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Company Name</p><p className="text-foreground font-medium">{demoCompany.name}</p></div>
            <div><p className="text-xs text-muted-foreground">Company Code</p><p className="text-foreground font-medium">{demoCompany.code}</p></div>
            <div><p className="text-xs text-muted-foreground">Platform</p><p className="text-foreground font-medium">FLC BI v1.0</p></div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Your Profile</h3>
          <div className="space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Name</p><p className="text-foreground font-medium">{user?.name}</p></div>
            <div><p className="text-xs text-muted-foreground">Email</p><p className="text-foreground font-medium">{user?.email}</p></div>
            <div><p className="text-xs text-muted-foreground">Role</p><p className="text-foreground font-medium capitalize">{user?.role?.replace('_', ' ')}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
