import { Route } from 'react-router-dom';
import {
  AutoAgingDashboardPage,
  VehicleExplorerPage,
  VehicleDetailPage,
  ImportCenterPage,
  DataQualityPage,
  SLAAdminPage,
  MappingAdminPage,
  ImportHistoryPage,
} from '@/modules/auto-aging/pages';

export function AutoAgingRoutes() {
  return (
    <>
      <Route path="/auto-aging" element={<AutoAgingDashboardPage />} />
      <Route path="/auto-aging/vehicles" element={<VehicleExplorerPage />} />
      <Route path="/auto-aging/vehicles/:chassisNo" element={<VehicleDetailPage />} />
      <Route path="/auto-aging/import" element={<ImportCenterPage />} />
      <Route path="/auto-aging/quality" element={<DataQualityPage />} />
      <Route path="/auto-aging/sla" element={<SLAAdminPage />} />
      <Route path="/auto-aging/mappings" element={<MappingAdminPage />} />
      <Route path="/auto-aging/history" element={<ImportHistoryPage />} />
    </>
  );
}
