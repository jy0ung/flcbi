import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';

export default function SLAAdmin() {
  const { slas, updateSla } = useData();
  const [edits, setEdits] = useState<Record<string, number>>({});

  const handleSave = (id: string) => {
    if (edits[id] !== undefined) {
      updateSla(id, edits[id]);
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="SLA Policies"
        description="Configure target days for each KPI milestone pair"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'SLA Policies' }]}
      />

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">KPI</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Current SLA (days)</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">New Value</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {slas.map(sla => (
              <tr key={sla.id} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium">{sla.label}</td>
                <td className="px-4 py-3 text-foreground tabular-nums">{sla.slaDays} days</td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    className="w-24 h-8 bg-secondary text-sm"
                    value={edits[sla.id] ?? sla.slaDays}
                    onChange={e => setEdits(prev => ({ ...prev, [sla.id]: parseInt(e.target.value) || 0 }))}
                  />
                </td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="outline" onClick={() => handleSave(sla.id)} disabled={edits[sla.id] === undefined}>
                    <Save className="h-3 w-3 mr-1" />Save
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
