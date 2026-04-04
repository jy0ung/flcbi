import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell } from 'recharts';
import type { OutlierPoint } from '@flcbi/contracts';

interface Props {
  data: OutlierPoint[];
  onVehicleClick?: (chassisNo: string) => void;
}

export function OutlierScatterChart({ data, onVehicleClick }: Props) {
  const scatterData = useMemo(() => data, [data]);

  const { p90BgDel, p90EtdToOut } = useMemo(() => {
    const bgDels = scatterData.map(d => d.bgToDelivery).sort((a, b) => a - b);
    const etdToOuts = scatterData.map(d => d.etdToOut).sort((a, b) => a - b);
    return {
      p90BgDel: bgDels[Math.floor(bgDels.length * 0.9)] ?? 60,
      p90EtdToOut: etdToOuts[Math.floor(etdToOuts.length * 0.9)] ?? 25,
    };
  }, [scatterData]);

  const getColor = (d: { bgToDelivery: number; etdToOut: number }) => {
    if (d.bgToDelivery > p90BgDel || d.etdToOut > p90EtdToOut) return 'hsl(0, 72%, 51%)';
    if (d.bgToDelivery > p90BgDel * 0.75 || d.etdToOut > p90EtdToOut * 0.75) return 'hsl(var(--primary))';
    return 'hsl(199, 89%, 48%)';
  };

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Outlier Detection — BG→Delivery vs ETD→Out</h3>
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
            dataKey="etdToOut"
            name="ETD→Out"
            unit="d"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            label={{ value: 'ETD → Out (days)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
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
