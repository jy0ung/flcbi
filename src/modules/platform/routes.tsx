import { Route } from 'react-router-dom';
import ExecutiveDashboard from '@/pages/ExecutiveDashboard';
import ModuleDirectory from '@/pages/ModuleDirectory';
import Notifications from '@/pages/Notifications';
import SettingsPage from '@/pages/admin/SettingsPage';

export function PlatformRoutes() {
  return (
    <>
      <Route path="/" element={<ExecutiveDashboard />} />
      <Route path="/modules" element={<ModuleDirectory />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/profile" element={<SettingsPage />} />
    </>
  );
}
