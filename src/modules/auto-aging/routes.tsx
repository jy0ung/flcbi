import { Route } from 'react-router-dom';
import AutoAgingDashboard from '@/pages/auto-aging/AutoAgingDashboard';
import VehicleExplorer from '@/pages/auto-aging/VehicleExplorer';
import VehicleDetail from '@/pages/auto-aging/VehicleDetail';
import ImportCenter from '@/pages/auto-aging/ImportCenter';
import DataQuality from '@/pages/auto-aging/DataQuality';
import SLAAdmin from '@/pages/auto-aging/SLAAdmin';
import MappingAdmin from '@/pages/auto-aging/MappingAdmin';
import ImportHistory from '@/pages/auto-aging/ImportHistory';

export function AutoAgingRoutes() {
  return (
    <>
      <Route path="/auto-aging" element={<AutoAgingDashboard />} />
      <Route path="/auto-aging/vehicles" element={<VehicleExplorer />} />
      <Route path="/auto-aging/vehicles/:chassisNo" element={<VehicleDetail />} />
      <Route path="/auto-aging/import" element={<ImportCenter />} />
      <Route path="/auto-aging/quality" element={<DataQuality />} />
      <Route path="/auto-aging/sla" element={<SLAAdmin />} />
      <Route path="/auto-aging/mappings" element={<MappingAdmin />} />
      <Route path="/auto-aging/history" element={<ImportHistory />} />
    </>
  );
}
