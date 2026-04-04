import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { VehicleCanonical } from '@/types';

interface Props {
  vehicles: VehicleCanonical[];
}

export function AgingTrendChart({ vehicles }: Props) {
  const trendData = useMemo(() => {
    const monthMap = new Map<string, { bgToDel: number[]; etdToOut: number[]; regToDel: number[] }>();

    vehicles.forEach(v => {
      if (!v.bg_date) return;
      const month = v.bg_date.slice(0, 7);
      const entry = monthMap.get(month) || { bgToDel: [], etdToOut: [], regToDel: [] };
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) entry.bgToDel.push(v.bg_to_delivery);
      if (v.etd_to_outlet != null && v.etd_to_outlet >= 0) entry.etdToOut.push(v.etd_to_outlet);
      if (v.reg_to_delivery != null && v.reg_to_delivery >= 0) entry.regToDel.push(v.reg_to_delivery);
      monthMap.set(month, entry);
    });

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        'BG→Delivery': avg(d.bgToDel),
        'ETD→Outlet': avg(d.etdToOut),
        'Reg→Delivery': avg(d.regToDel),
      }));
  }, [vehicles]);

  return (
    <div className="glass-panel p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Aging Trend Over Time</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} unit="d" />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(var(--foreground))',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Line type="monotone" dataKey="BG→Delivery" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="ETD→Outlet" stroke="hsl(199, 89%, 48%)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Reg→Delivery" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
