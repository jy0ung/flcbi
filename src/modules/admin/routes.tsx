import { Route } from 'react-router-dom';
import { RequireRole } from '@/components/auth/RequireRole';
import UserManagement from '@/pages/admin/UserManagement';
import AuditLog from '@/pages/admin/AuditLog';
import SettingsPage from '@/pages/admin/SettingsPage';

export function AdminRoutes() {
  return (
    <>
      <Route
        path="/admin/users"
        element={
          <RequireRole roles={['super_admin', 'company_admin']}>
            <UserManagement />
          </RequireRole>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <RequireRole roles={['super_admin', 'company_admin', 'director']}>
            <AuditLog />
          </RequireRole>
        }
      />
      <Route path="/admin/settings" element={<SettingsPage />} />
    </>
  );
}
