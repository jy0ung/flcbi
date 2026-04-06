import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPermissionsForUser, type AppRole, type AuthSession, type User, type UserStatus } from "@flcbi/contracts";
import { apiClient, isApiAuthError } from "@/lib/api-client";
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
const AUTH_SESSION_CACHE_KEY = "flcbi.auth.session-cache";

type SupabaseTokenPayload = {
  sub?: string;
  email?: string;
  exp?: number;
  app_metadata?: {
    app_role?: AppRole;
    company_id?: string;
    branch_ids?: string[];
    status?: UserStatus;
  };
  user_metadata?: {
    name?: string;
  };
};

function readStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function persistStoredSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify(session));
}

function parseTokenPayload(token: string): SupabaseTokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as SupabaseTokenPayload;
  } catch {
    return null;
  }
}

function buildFallbackSession(token: string, cachedSession?: AuthSession | null): AuthSession | null {
  const payload = parseTokenPayload(token);
  const role = payload?.app_metadata?.app_role;
  const companyId = payload?.app_metadata?.company_id;
  const userId = payload?.sub;
  const email = payload?.email;

  if (!role || !companyId || !userId || !email) {
    return cachedSession ?? null;
  }

  const user: User = {
    id: userId,
    email,
    name: payload?.user_metadata?.name ?? cachedSession?.user.name ?? email.split("@")[0],
    role,
    companyId,
    branchId: payload?.app_metadata?.branch_ids?.[0] ?? cachedSession?.user.branchId,
    status: payload?.app_metadata?.status ?? cachedSession?.user.status,
    avatar: cachedSession?.user.avatar,
  };

  return {
    token,
    user,
    permissions: getPermissionsForUser(user),
    expiresAt: payload?.exp
      ? new Date(payload.exp * 1000).toISOString()
      : cachedSession?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    provider: "supabase",
  };
}

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

    const clearSession = async () => {
      if (mounted) {
        setSession(null);
      }
      persistStoredSession(null);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    };

    const syncSession = async () => {
      let accessToken = "";
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token ?? "";
        if (!accessToken) {
          if (mounted) setSession(null);
          persistStoredSession(null);
          return;
        }

        const fallbackSession = buildFallbackSession(accessToken, readStoredSession());
        if (mounted && fallbackSession) {
          setSession((current) => current ?? fallbackSession);
        }

        const response = await apiClient.me();
        if (mounted) {
          setSession(response.session);
        }
        persistStoredSession(response.session);
      } catch (error) {
        if (isApiAuthError(error)) {
          await clearSession();
          return;
        }

        const fallbackSession = buildFallbackSession(accessToken, readStoredSession());
        if (mounted && fallbackSession) {
          setSession(fallbackSession);
          persistStoredSession(fallbackSession);
        }
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
        persistStoredSession(null);
        setIsLoading(false);
        void queryClient.clear();
        return;
      }

      setIsLoading(true);
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
        persistStoredSession(null);
        return false;
      }

      const { data } = await supabase.auth.getSession();
      const fallbackSession = data.session?.access_token
        ? buildFallbackSession(data.session.access_token, readStoredSession())
        : null;

      try {
        const response = await apiClient.me();
        setSession(response.session);
        persistStoredSession(response.session);
      } catch (error) {
        if (isApiAuthError(error)) {
          setSession(null);
          persistStoredSession(null);
          return false;
        }
        if (!fallbackSession) {
          setSession(null);
          persistStoredSession(null);
          return false;
        }
        setSession(fallbackSession);
        persistStoredSession(fallbackSession);
      }

      await queryClient.invalidateQueries();
      return true;
    } catch {
      setSession(null);
      persistStoredSession(null);
      return false;
    }
  }, [queryClient]);

  const logout = useCallback(() => {
    setSession(null);
    persistStoredSession(null);
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
