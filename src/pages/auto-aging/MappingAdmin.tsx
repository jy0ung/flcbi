import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';

const mappingCategories = [
  { title: 'Branch Mappings', description: 'Map raw branch codes to canonical branch names', items: [
    { raw: 'KK', canonical: 'KK', notes: 'Kota Kinabalu' },
    { raw: 'TWU', canonical: 'TWU', notes: 'Tawau' },
    { raw: 'SDK', canonical: 'SDK', notes: 'Sandakan' },
    { raw: 'LDU', canonical: 'LDU', notes: 'Lahad Datu' },
    { raw: 'BTU', canonical: 'BTU', notes: 'Bintulu' },
    { raw: 'MYY', canonical: 'MYY', notes: 'Miri' },
    { raw: 'SBW', canonical: 'SBW', notes: 'Sibu' },
  ]},
  { title: 'Payment Method Mappings', description: 'Normalize payment method values', items: [
    { raw: 'CASH', canonical: 'Cash', notes: '' },
    { raw: 'LOAN', canonical: 'Loan', notes: '' },
    { raw: 'GOV', canonical: 'Government', notes: '' },
    { raw: 'GOVERNMENT', canonical: 'Government', notes: '' },
  ]},
];

export default function MappingAdmin() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Mapping Administration"
        description="Manage data normalization rules for imports"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Mappings' }]}
      />

      {mappingCategories.map(cat => (
        <div key={cat.title} className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{cat.title}</h3>
            <p className="text-xs text-muted-foreground">{cat.description}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Raw Value</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Canonical Value</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {cat.items.map(item => (
                <tr key={item.raw} className="data-table-row">
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{item.raw}</td>
                  <td className="px-4 py-2 text-foreground font-medium">{item.canonical}</td>
                  <td className="px-4 py-2 text-muted-foreground">{item.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
