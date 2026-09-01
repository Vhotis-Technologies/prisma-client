import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import {
  clearSession,
  getStoredUser,
  hasSession,
  SESSION_CLEARED_EVENT,
  setSession,
  setStoredUser,
  type SetSessionOptions,
} from "../lib/authStorage";
import * as authApi from "../store/api/authApi";
import { claimGuestAccount } from "../store/api/guestApi";
import type { LoginResponse, RegisterCredentials, UserProfile } from "../types/user";

type AuthContextValue = {
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  completePasswordReset: (token: string, password: string) => Promise<void>;
  completeInvite: (token: string, password: string) => Promise<void>;
  completeGuestClaim: (token: string, password: string, allowMarketing?: boolean) => Promise<void>;
  updateUser: (user: UserProfile) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() =>
    hasSession() ? getStoredUser() : null,
  );

  useEffect(() => {
    const onCleared = () => setUser(null);
    window.addEventListener(SESSION_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onCleared);
  }, []);

  const applySession = useCallback((data: LoginResponse, options?: SetSessionOptions) => {
    if (!data.access || !data.refresh || !data.user) {
      throw new Error("Invalid auth response");
    }
    setSession(data.access, data.refresh, data.user, options);
    setUser(data.user);
  }, []);

  const hydrateSession = useCallback(async (access: string, refresh: string) => {
    if (!access || !refresh) {
      throw new Error("Invalid auth response");
    }
    setSession(access, refresh, undefined, { persist: true });
    const profileData = await authApi.getProfile();
    if (!profileData.profile) {
      throw new Error("Invalid auth response");
    }
    setSession(access, refresh, profileData.profile, { persist: true });
    setUser(profileData.profile);
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      applySession(await authApi.login(email, password), { persist: rememberMe });
    },
    [applySession],
  );

  const register = useCallback(
    async (credentials: RegisterCredentials) => {
      applySession(await authApi.register(credentials), { persist: true });
    },
    [applySession],
  );

  const completePasswordReset = useCallback(async (token: string, password: string) => {
    const data = await authApi.resetPassword(token, password);
    await hydrateSession(data.access, data.refresh);
  }, [hydrateSession]);

  const completeInvite = useCallback(async (token: string, password: string) => {
    const data = await authApi.acceptInvite(token, password);
    await hydrateSession(data.access, data.refresh);
  }, [hydrateSession]);

  const completeGuestClaim = useCallback(
    async (token: string, password: string, allowMarketing = false) => {
      applySession(await claimGuestAccount({ token, password, allow_marketing: allowMarketing }), {
        persist: true,
      });
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((next: UserProfile) => {
    setStoredUser(next);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && hasSession()),
      login,
      register,
      completePasswordReset,
      completeInvite,
      completeGuestClaim,
      updateUser,
      logout,
    }),
    [user, login, register, completePasswordReset, completeInvite, completeGuestClaim, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function authErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401) {
      return "Email or password is incorrect.";
    }
    if (status === 429) {
      const limited = err.response?.data as { detail?: string; error?: string } | undefined;
      if (limited?.error) return String(limited.error);
      if (limited?.detail) return String(limited.detail);
      return "Too many attempts. Wait a minute and try again.";
    }
    const body = err.response?.data as {
      detail?: string;
      error?: string;
      non_field_errors?: string[];
    } | undefined;
    if (body?.error) return String(body.error);
    if (body?.detail) return String(body.detail);
    if (Array.isArray(body?.non_field_errors) && body.non_field_errors[0]) {
      return String(body.non_field_errors[0]);
    }
  }
  return err instanceof Error ? err.message : fallback;
}

export function loginErrorMessage(err: unknown): string {
  return authErrorMessage(err, "Sign in failed.");
}
