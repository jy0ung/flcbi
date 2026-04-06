import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  published: 'bg-success/15 text-success',
  active: 'bg-success/15 text-success',
  success: 'bg-success/15 text-success',
  pending: 'bg-warning/15 text-warning',
  disabled: 'bg-muted text-muted-foreground',
  validated: 'bg-info/15 text-info',
  validating: 'bg-info/15 text-info',
  info: 'bg-info/15 text-info',
  uploaded: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/15 text-destructive',
  error: 'bg-destructive/15 text-destructive',
  warning: 'bg-warning/15 text-warning',
  normalization_in_progress: 'bg-info/15 text-info',
  normalization_complete: 'bg-info/15 text-info',
  publish_in_progress: 'bg-primary/15 text-primary',
  coming_soon: 'bg-primary/15 text-primary',
  planned: 'bg-muted text-muted-foreground',
  missing: 'bg-warning/15 text-warning',
  negative: 'bg-destructive/15 text-destructive',
  duplicate: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/15 text-destructive',
  format_error: 'bg-warning/15 text-warning',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={cn('status-badge', style, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
