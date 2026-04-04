import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppRole, AuthSession, User } from "@flcbi/contracts";
import { apiClient } from "@/lib/api-client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const syncSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) {
          if (mounted) setSession(null);
          return;
        }

        const response = await apiClient.me();
        if (mounted) {
          setSession(response.session);
        }
      } catch {
        if (mounted) {
          setSession(null);
        }
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!authSession) {
        setSession(null);
        setIsLoading(false);
        void queryClient.clear();
        return;
      }

      void syncSession();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) {
      setSession(null);
      return false;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setSession(null);
        return false;
      }

      const response = await apiClient.me();
      setSession(response.session);
      await queryClient.invalidateQueries();
      return true;
    } catch {
      setSession(null);
      return false;
    }
  }, [queryClient]);

  const logout = useCallback(() => {
    setSession(null);
    void queryClient.clear();
    if (supabase) {
      void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  }, [queryClient]);

  const hasRole = useCallback((roles: AppRole[]): boolean => {
    const user = session?.user;
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return roles.includes(user.role);
  }, [session]);

  const value = useMemo<AuthContextType>(() => ({
    user: session?.user ?? null,
    session,
    isAuthenticated: Boolean(session?.token),
    isLoading,
    login,
    logout,
    hasRole,
  }), [session, isLoading, login, logout, hasRole]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
