import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import type { AppRole } from "@flcbi/contracts";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ApiError } from "@/lib/api-client";

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
import Forbidden from "@/pages/Forbidden";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          return false;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function RoleBoundary({
  roles,
  children,
  title,
}: {
  roles: AppRole[];
  children: React.ReactNode;
  title: string;
}) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return <Forbidden title={title} />;
  }

  return <>{children}</>;
}

function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ExecutiveDashboard />} />
        <Route path="/modules" element={<ModuleDirectory />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<SettingsPage />} />
        <Route path="/auto-aging" element={<AutoAgingDashboard />} />
        <Route path="/auto-aging/vehicles" element={<VehicleExplorer />} />
        <Route path="/auto-aging/vehicles/:chassisNo" element={<VehicleDetail />} />
        <Route
          path="/auto-aging/import"
          element={(
            <RoleBoundary
              roles={["company_admin", "super_admin", "director"]}
              title="Import Access Required"
            >
              <ImportCenter />
            </RoleBoundary>
          )}
        />
        <Route path="/auto-aging/quality" element={<DataQuality />} />
        <Route path="/auto-aging/sla" element={<SLAAdmin />} />
        <Route path="/auto-aging/mappings" element={<MappingAdmin />} />
        <Route path="/auto-aging/history" element={<ImportHistory />} />
        <Route
          path="/admin/users"
          element={(
            <RoleBoundary
              roles={["company_admin", "super_admin"]}
              title="Admin Access Required"
            >
              <UserManagement />
            </RoleBoundary>
          )}
        />
        <Route
          path="/admin/audit"
          element={(
            <RoleBoundary
              roles={["company_admin", "super_admin", "director"]}
              title="Audit Access Required"
            >
              <AuditLog />
            </RoleBoundary>
          )}
        />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
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
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
