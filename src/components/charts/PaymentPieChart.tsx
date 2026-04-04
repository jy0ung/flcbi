import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { PaymentDistribution } from '@flcbi/contracts';

interface Props {
  data: PaymentDistribution[];
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)',
  'hsl(350, 65%, 55%)',
  'hsl(30, 90%, 55%)',
];

export function PaymentPieChart({ data }: Props) {
  const pieData = data.map(({ name, value }) => ({ name, value }));
  const avgByMethod = data.map(({ name, avg }) => ({ name, avg }));
  return (
    <div className="glass-panel p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Payment Method Distribution</h3>
      <div className="grid grid-cols-2 gap-4">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: number, name: string) => [`${value} vehicles`, name]}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col justify-center space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Avg BG→Delivery by Method</p>
          {avgByMethod.map((m, i) => (
            <div key={m.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-foreground">{m.name}</span>
              </div>
              <span className="text-xs font-mono font-semibold text-foreground">{m.avg}d</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
