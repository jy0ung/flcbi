import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';

export default function VehicleDetail() {
  const { chassisNo } = useParams<{ chassisNo: string }>();
  const { vehicles, qualityIssues } = useData();
  const navigate = useNavigate();

  const vehicle = vehicles.find(v => v.chassisNo === chassisNo);
  if (!vehicle) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader title="Vehicle Not Found" />
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
      </div>
    );
  }

  const issues = qualityIssues.filter(q => q.chassisNo === chassisNo);

  const milestones = [
    { label: 'BG Date', date: vehicle.bgDate },
    { label: 'Shipment ETD', date: vehicle.shipmentEtdPkg },
    { label: 'Shipment ETA', date: vehicle.shipmentEtaKkTwuSdk },
    { label: 'Outlet Received', date: vehicle.dateReceivedByOutlet },
    { label: 'Delivery', date: vehicle.deliveryDate },
    { label: 'Disbursement', date: vehicle.disbDate },
  ];

  const kpiValues = KPI_DEFINITIONS.map(k => ({
    label: k.shortLabel,
    value: vehicle[k.computedField] as number | null,
    sla: k.slaDefault,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={vehicle.chassisNo}
        description={`${vehicle.model} • ${vehicle.branch} • ${vehicle.customerName}`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicles' }, { label: vehicle.chassisNo }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back</Button>}
      />

      {/* Vehicle Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Vehicle Information</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Chassis No.', vehicle.chassisNo],
              ['Model', vehicle.model],
              ['Branch', vehicle.branch],
              ['Payment', vehicle.paymentMethod],
              ['Salesman', vehicle.salesman],
              ['Customer', vehicle.customerName],
              ['D2D/Transfer', vehicle.isD2D ? 'Yes' : 'No'],
              ['Remarks', vehicle.remarks || '—'],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-foreground font-medium">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Milestone Timeline</h3>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={m.label} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.date ? 'bg-success/15' : 'bg-muted'}`}>
                    {m.date ? <CheckCircle className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  {i < milestones.length - 1 && <div className="w-0.5 h-4 bg-border mt-1" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-sm text-foreground font-medium">{m.date || 'Pending'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="glass-panel p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">KPI Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {kpiValues.map(k => (
            <div key={k.label} className="p-3 rounded-lg bg-secondary/50 border border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{k.label}</p>
              {k.value != null ? (
                <p className={`text-xl font-bold tabular-nums ${k.value < 0 ? 'text-destructive' : k.value > k.sla ? 'text-warning' : 'text-foreground'}`}>
                  {k.value}<span className="text-xs text-muted-foreground ml-0.5">d</span>
                </p>
              ) : (
                <p className="text-xl font-bold text-muted-foreground">—</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">SLA: {k.sla}d</p>
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Data Quality Issues
          </h3>
          <div className="space-y-2">
            {issues.map(issue => (
              <div key={issue.id} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                <span className="text-sm text-foreground">{issue.message}</span>
                <StatusBadge status={issue.severity} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
