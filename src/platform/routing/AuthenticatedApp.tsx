import { Route, Routes } from 'react-router-dom';
import { DataProvider } from '@/contexts/DataContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PlatformRoutes } from '@/modules/platform/routes';
import { AutoAgingRoutes } from '@/modules/auto-aging/routes';
import { AdminRoutes } from '@/modules/admin/routes';
import NotFound from '@/pages/NotFound';

export function AuthenticatedApp() {
  return (
    <DataProvider>
      <AppLayout>
        <Routes>
          <PlatformRoutes />
          <AutoAgingRoutes />
          <AdminRoutes />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </DataProvider>
  );
}
