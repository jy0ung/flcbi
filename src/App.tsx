import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/LoginPage";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";
import ModuleDirectory from "@/pages/ModuleDirectory";
import Notifications from "@/pages/Notifications";
import AutoAgingDashboard from "@/pages/auto-aging/AutoAgingDashboard";
import VehicleExplorer from "@/pages/auto-aging/VehicleExplorer";
import VehicleDetail from "@/pages/auto-aging/VehicleDetail";
import ImportCenter from "@/pages/auto-aging/ImportCenter";
import DataQuality from "@/pages/auto-aging/DataQuality";
import SLAAdmin from "@/pages/auto-aging/SLAAdmin";
import MappingAdmin from "@/pages/auto-aging/MappingAdmin";
import ImportHistory from "@/pages/auto-aging/ImportHistory";
import UserManagement from "@/pages/admin/UserManagement";
import AuditLog from "@/pages/admin/AuditLog";
import SettingsPage from "@/pages/admin/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <DataProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<ExecutiveDashboard />} />
          <Route path="/modules" element={<ModuleDirectory />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<SettingsPage />} />
          <Route path="/auto-aging" element={<AutoAgingDashboard />} />
          <Route path="/auto-aging/vehicles" element={<VehicleExplorer />} />
          <Route path="/auto-aging/vehicles/:chassisNo" element={<VehicleDetail />} />
          <Route path="/auto-aging/import" element={<ImportCenter />} />
          <Route path="/auto-aging/quality" element={<DataQuality />} />
          <Route path="/auto-aging/sla" element={<SLAAdmin />} />
          <Route path="/auto-aging/mappings" element={<MappingAdmin />} />
          <Route path="/auto-aging/history" element={<ImportHistory />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/audit" element={<AuditLog />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </DataProvider>
  );
}

function AuthRoutes() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthRoutes />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
