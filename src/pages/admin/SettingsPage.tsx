import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { demoBranches } from '@/data/demo-data';
import { AppRole } from '@/types';

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

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRole(user.role || 'analyst');
      setBranchId(user.branch_id || 'none');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name,
        role,
        branch_id: branchId === 'none' ? null : branchId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile: ' + error.message);
    } else {
      toast.success('Profile updated successfully');
      // Refresh profile in auth context by reloading
      window.location.reload();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" description="Manage your profile and preferences" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Settings' }]} />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Editable Profile */}
        <div className="glass-panel p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Your Profile</h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ''} disabled className="bg-muted/50" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch">Branch Assignment</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch assigned</SelectItem>
                  {demoBranches.map((b) => (
                    <SelectItem key={b.id} value={b.code}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>

        {/* Company Info (read-only) */}
        <div className="glass-panel p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Company Information</h3>
          <div className="space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Company</p><p className="text-foreground font-medium">FLC Auto Group</p></div>
            <div><p className="text-xs text-muted-foreground">Company Code</p><p className="text-foreground font-medium">FLC</p></div>
            <div><p className="text-xs text-muted-foreground">Platform</p><p className="text-foreground font-medium">FLC BI v1.0</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
