import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { QueryErrorState } from '@/components/shared/QueryErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Shield } from 'lucide-react';
import { useAdminUsers } from '@/hooks/api/use-platform';

export default function UserManagement() {
  const { data, error, isError, isLoading, refetch } = useAdminUsers();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading users...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Users & Roles" description="Manage platform users and role assignments" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]} />
        <QueryErrorState
          title="Could not load users"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const users = data?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Users & Roles" description="Manage platform users and role assignments" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]} />
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Name</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Email</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Role</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Branch</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No users have been provisioned for this company yet.
                </td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.email} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{u.name.charAt(0)}</span>
                  </div>
                  {u.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                <td className="px-4 py-3"><span className="flex items-center gap-1 text-foreground capitalize"><Shield className="h-3 w-3 text-primary" />{u.role.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-foreground">{u.branchId ? 'Restricted' : 'Company-wide'}</td>
                <td className="px-4 py-3"><StatusBadge status="active" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
