import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE } from '@/types';
import { demoBranches } from '@/data/demo-data';
import { AccessDenied } from '@/components/auth/AccessDenied';

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
  branch_id: string | null;
  access_scope: string;
  created_at: string;
}

const ROLES: { value: AppRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'director', label: 'Director' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales', label: 'Sales' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'analyst', label: 'Analyst' },
];

const SCOPES: { value: AccessScope; label: string }[] = [
  { value: 'self', label: 'Self — own records only' },
  { value: 'branch', label: 'Branch — assigned branch' },
  { value: 'company', label: 'Company — full company' },
  { value: 'global', label: 'Global — all companies' },
];

export default function UserManagement() {
  const { hasRole } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<ProfileRow | null>(null);
  const [editRole, setEditRole] = useState<string>('');
  const [editScope, setEditScope] = useState<string>('');
  const [editBranch, setEditBranch] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const canManage = hasRole(['super_admin', 'company_admin']);

  useEffect(() => {
    async function load() {
      if (!canManage) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, email, name, role, company_id, branch_id, access_scope, created_at')
        .order('created_at', { ascending: true });

      setProfiles((data || []) as unknown as ProfileRow[]);
      setLoading(false);
    }

    load();
  }, [canManage]);

  const openEdit = (p: ProfileRow) => {
    setEditUser(p);
    setEditRole(p.role);
    setEditScope(p.access_scope);
    setEditBranch(p.branch_id || 'none');
  };

  const handleRoleChange = (newRole: string) => {
    setEditRole(newRole);
    const defaultScope = ROLE_DEFAULT_SCOPE[newRole as AppRole] || 'company';
    setEditScope(defaultScope);
  };

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        role: editRole,
        access_scope: editScope,
        branch_id: editBranch === 'none' ? null : editBranch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editUser.id);

    if (error) {
      toast.error('Failed to update user: ' + error.message);
    } else {
      toast.success('User updated successfully');
      setProfiles(prev => prev.map(p => p.id === editUser.id ? { ...p, role: editRole, access_scope: editScope, branch_id: editBranch === 'none' ? null : editBranch } : p));
      setEditUser(null);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <AccessDenied
        title="Restricted user management area"
        message="Only company administrators and super administrators can manage users and roles."
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Users & Roles" description="Manage platform users, roles, and access scope" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]} />
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Name</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Email</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Role</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Access Scope</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Branch</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{p.name.charAt(0)}</span>
                  </div>
                  {p.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{p.email}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-foreground capitalize">
                    <Shield className="h-3 w-3 text-primary" />
                    {p.role.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.access_scope} />
                </td>
                <td className="px-4 py-3 text-foreground">{p.branch_id || '—'}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={handleRoleChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Access Scope</Label>
              <Select value={editScope} onValueChange={setEditScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This user can access: <strong className="text-foreground capitalize">{editScope}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Branch Assignment</Label>
              <Select value={editBranch} onValueChange={setEditBranch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch assigned</SelectItem>
                  {demoBranches.map(b => (
                    <SelectItem key={b.id} value={b.code}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
              <p className="font-medium text-foreground">Access Summary</p>
              <p className="text-muted-foreground">
                {editScope === 'global' && 'Can see all companies and all data.'}
                {editScope === 'company' && `Can see all data within company ${editUser?.company_id}.`}
                {editScope === 'branch' && `Can see all data in branch ${editBranch === 'none' ? '(unassigned)' : editBranch} within company ${editUser?.company_id}.`}
                {editScope === 'self' && `Can only see records assigned to this user within company ${editUser?.company_id}.`}
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
