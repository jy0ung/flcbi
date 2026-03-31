import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  status?: 'normal' | 'warning' | 'critical';
  validCount?: number;
  overdueCount?: number;
  onClick?: () => void;
}

export function KpiCard({ label, value, unit = 'days', subtitle, trend, trendValue, status = 'normal', validCount, overdueCount, onClick }: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const statusColor = status === 'critical' ? 'text-destructive' : status === 'warning' ? 'text-warning' : 'text-primary';

  return (
    <div className={cn("kpi-card cursor-pointer group", onClick && "hover:scale-[1.02]")} onClick={onClick}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end gap-2 mb-1">
        <span className={cn("text-3xl font-bold tabular-nums", statusColor)}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground mb-1">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-3">
          {validCount !== undefined && (
            <span className="text-[10px] text-muted-foreground">{validCount} valid</span>
          )}
          {overdueCount !== undefined && overdueCount > 0 && (
            <span className="text-[10px] text-destructive font-medium">{overdueCount} overdue</span>
          )}
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs", trend === 'down' ? 'text-success' : trend === 'up' ? 'text-destructive' : 'text-muted-foreground')}>
            <TrendIcon className="h-3 w-3" />
            {trendValue && <span>{trendValue}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
