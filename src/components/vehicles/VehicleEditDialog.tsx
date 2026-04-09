import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VehicleCanonical } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VehicleEditDialogProps {
  vehicle: VehicleCanonical | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const FIELDS: { key: keyof VehicleCanonical; label: string; type: 'text' | 'date' }[] = [
  { key: 'chassis_no', label: 'Chassis No.', type: 'text' },
  { key: 'customer_name', label: 'Customer Name', type: 'text' },
  { key: 'branch_code', label: 'Branch Code', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'variant', label: 'Variant', type: 'text' },
  { key: 'payment_method', label: 'Payment Method', type: 'text' },
  { key: 'salesman_name', label: 'Salesman', type: 'text' },
  { key: 'bg_date', label: 'BG Date', type: 'date' },
  { key: 'shipment_etd_pkg', label: 'Shipment ETD', type: 'date' },
  { key: 'date_received_by_outlet', label: 'Received by Outlet', type: 'date' },
  { key: 'reg_date', label: 'Registration Date', type: 'date' },
  { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
  { key: 'disb_date', label: 'Disbursement Date', type: 'date' },
  { key: 'remark', label: 'Remark', type: 'text' },
];

export function VehicleEditDialog({ vehicle, open, onOpenChange, onSaved }: VehicleEditDialogProps) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) {
      const initial: Record<string, string> = {};
      FIELDS.forEach(f => {
        initial[f.key] = String(vehicle[f.key] ?? '');
      });
      setForm(initial);
    }
  }, [vehicle]);

  const handleSave = async () => {
    if (!vehicle) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      FIELDS.forEach(f => {
        const val = form[f.key]?.trim();
        if (f.type === 'date') {
          updates[f.key] = val || null;
        } else {
          updates[f.key] = val || (f.key === 'chassis_no' ? vehicle.chassis_no : '');
        }
      });

      const { error } = await supabase
        .from('vehicles')
        .update(updates as never)
        .eq('id', vehicle.id);

      if (error) throw error;
      toast.success('Vehicle updated successfully');
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error('Failed to update vehicle: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Vehicle — {vehicle?.chassis_no}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          {FIELDS.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
              <Input
                id={f.key}
                type={f.type}
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
