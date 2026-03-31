import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Shield } from 'lucide-react';

const demoUsers = [
  { name: 'Sarah Chen', email: 'director@flc.com', role: 'director', branch: 'All', status: 'active' },
  { name: 'Admin User', email: 'admin@flc.com', role: 'company_admin', branch: 'All', status: 'active' },
  { name: 'Branch Manager', email: 'manager@flc.com', role: 'manager', branch: 'KK', status: 'active' },
  { name: 'Data Analyst', email: 'analyst@flc.com', role: 'analyst', branch: 'All', status: 'active' },
  { name: 'James Wong', email: 'james@flc.com', role: 'sales', branch: 'KK', status: 'active' },
  { name: 'Siti Aminah', email: 'siti@flc.com', role: 'accounts', branch: 'TWU', status: 'active' },
];

export default function UserManagement() {
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
            {demoUsers.map(u => (
              <tr key={u.email} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{u.name.charAt(0)}</span>
                  </div>
                  {u.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                <td className="px-4 py-3"><span className="flex items-center gap-1 text-foreground capitalize"><Shield className="h-3 w-3 text-primary" />{u.role.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-foreground">{u.branch}</td>
                <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
