import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireRole } from "@/components/auth/RequireRole";
import { AppRole } from "@/types";

import LoginPage from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
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
const USER_MANAGEMENT_ROLES: AppRole[] = ["super_admin", "company_admin"];
const AUDIT_ROLES: AppRole[] = ["super_admin", "company_admin", "director"];

function AppShellRoutes() {
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
          <Route
            path="/admin/users"
            element={
              <RequireRole
                roles={USER_MANAGEMENT_ROLES}
                title="Restricted admin area"
                message="Only company administrators and super administrators can manage users and roles."
              >
                <UserManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireRole
                roles={AUDIT_ROLES}
                title="Restricted audit area"
                message="Only approved leadership roles can view the audit log."
              >
                <AuditLog />
              </RequireRole>
            }
          />
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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppShellRoutes />
                </RequireAuth>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
