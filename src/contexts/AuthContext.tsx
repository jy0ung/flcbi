import React, { createContext, useContext, useState, useCallback } from 'react';
import { User, AppRole } from '@/types';
import { demoUser } from '@/data/demo-data';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEMO_USERS: Record<string, User> = {
  'director@flc.com': { ...demoUser },
  'admin@flc.com': { id: 'u2', email: 'admin@flc.com', name: 'Admin User', role: 'company_admin', companyId: 'c1' },
  'manager@flc.com': { id: 'u3', email: 'manager@flc.com', name: 'Branch Manager', role: 'manager', companyId: 'c1', branchId: 'br-0' },
  'analyst@flc.com': { id: 'u4', email: 'analyst@flc.com', name: 'Data Analyst', role: 'analyst', companyId: 'c1' },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('flc_bi_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email: string, _password: string): Promise<boolean> => {
    const u = DEMO_USERS[email.toLowerCase()];
    if (u) {
      setUser(u);
      localStorage.setItem('flc_bi_user', JSON.stringify(u));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('flc_bi_user');
  }, []);

  const hasRole = useCallback((roles: AppRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
