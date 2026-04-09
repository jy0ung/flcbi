import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Timer, LayoutDashboard, Bell, Search, Settings, Shield, FileText,
  LogOut, ChevronLeft, ChevronRight, Upload, Car, AlertTriangle, Gauge,
  Map, History, Grid3X3, UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  section?: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Executive Dashboard', path: '/', icon: LayoutDashboard, section: 'Platform' },
  { label: 'Module Directory', path: '/modules', icon: Grid3X3, section: 'Platform' },
  { label: 'Notifications', path: '/notifications', icon: Bell, section: 'Platform' },

  { label: 'Aging Dashboard', path: '/auto-aging', icon: Timer, section: 'Auto Aging' },
  { label: 'Vehicle Explorer', path: '/auto-aging/vehicles', icon: Car, section: 'Auto Aging' },
  { label: 'Import Center', path: '/auto-aging/import', icon: Upload, section: 'Auto Aging' },
  { label: 'Data Quality', path: '/auto-aging/quality', icon: AlertTriangle, section: 'Auto Aging' },
  { label: 'SLA Policies', path: '/auto-aging/sla', icon: Gauge, section: 'Auto Aging' },
  { label: 'Mappings', path: '/auto-aging/mappings', icon: Map, section: 'Auto Aging' },
  { label: 'Import History', path: '/auto-aging/history', icon: History, section: 'Auto Aging' },

  { label: 'Users & Roles', path: '/admin/users', icon: Shield, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Audit Log', path: '/admin/audit', icon: FileText, section: 'Admin', roles: ['super_admin', 'company_admin', 'director'] },
  { label: 'Settings', path: '/admin/settings', icon: Settings, section: 'Admin' },
];

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function AppSidebar({ collapsed, setCollapsed }: AppSidebarProps) {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();

  const sections = [...new Set(navItems.map(n => n.section))];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className={cn(
      "h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0 sticky top-0",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground font-bold text-sm">F</span>
        </div>
        {!collapsed && <span className="text-foreground font-semibold text-lg">FLC BI</span>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {sections.map(section => {
          const items = navItems.filter(n => n.section === section);
          const visibleItems = items.filter(item => {
            if (!item.roles) return true;
            return hasRole(item.roles as any);
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={section}>
              {!collapsed && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-1 font-medium">{section}</p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive(item.path)
                        ? "nav-item-active"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User & Collapse */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <Link
          to="/profile"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
            collapsed && "justify-center"
          )}
        >
          <UserCircle className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span className="truncate">{user?.name}</span>}
        </Link>
        <button
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors w-full",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
