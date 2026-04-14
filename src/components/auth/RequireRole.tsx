import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types';
import { AccessDenied } from '@/components/auth/AccessDenied';

interface RequireRoleProps {
  roles: AppRole[];
  children: React.ReactNode;
  title?: string;
  message?: string;
}

export function RequireRole({
  roles,
  children,
  title,
  message,
}: RequireRoleProps) {
  const { hasRole } = useAuth();

  if (!hasRole(roles)) {
    return <AccessDenied title={title} message={message} />;
  }

  return <>{children}</>;
}
