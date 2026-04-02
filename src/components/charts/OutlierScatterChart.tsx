import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell } from 'recharts';
import { VehicleCanonical } from '@/types';

interface Props {
  vehicles: VehicleCanonical[];
  onVehicleClick?: (chassisNo: string) => void;
}

export function OutlierScatterChart({ vehicles, onVehicleClick }: Props) {
  const scatterData = useMemo(() => {
    return vehicles
      .filter(v => v.bg_to_delivery != null && v.bg_to_delivery >= 0 && v.etd_to_eta != null && v.etd_to_eta >= 0)
      .map(v => ({
        chassisNo: v.chassis_no,
        branch: v.branch_code,
        bgToDelivery: v.bg_to_delivery!,
        etdToEta: v.etd_to_eta!,
      }));
  }, [vehicles]);

  const { p90BgDel, p90EtdEta } = useMemo(() => {
    const bgDels = scatterData.map(d => d.bgToDelivery).sort((a, b) => a - b);
    const etdEtas = scatterData.map(d => d.etdToEta).sort((a, b) => a - b);
    return {
      p90BgDel: bgDels[Math.floor(bgDels.length * 0.9)] ?? 60,
      p90EtdEta: etdEtas[Math.floor(etdEtas.length * 0.9)] ?? 25,
    };
  }, [scatterData]);

  const getColor = (d: { bgToDelivery: number; etdToEta: number }) => {
    if (d.bgToDelivery > p90BgDel || d.etdToEta > p90EtdEta) return 'hsl(0, 72%, 51%)';
    if (d.bgToDelivery > p90BgDel * 0.75 || d.etdToEta > p90EtdEta * 0.75) return 'hsl(var(--primary))';
    return 'hsl(199, 89%, 48%)';
  };

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Outlier Detection — BG→Delivery vs ETD→ETA</h3>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(199,89%,48%)]" />Normal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />At Risk</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" />Outlier</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="bgToDelivery"
            name="BG→Delivery"
            unit="d"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            label={{ value: 'BG → Delivery (days)', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            dataKey="etdToEta"
            name="ETD→ETA"
            unit="d"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            label={{ value: 'ETD → ETA (days)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <ZAxis range={[30, 30]} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(var(--foreground))',
            }}
            formatter={(value: number, name: string) => [`${value}d`, name]}
            labelFormatter={() => ''}
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Scatter
            data={scatterData}
            onClick={(d) => onVehicleClick?.(d.chassisNo)}
            style={{ cursor: 'pointer' }}
          >
            {scatterData.map((entry, i) => (
              <Cell key={i} fill={getColor(entry)} fillOpacity={0.7} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
