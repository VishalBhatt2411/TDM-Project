import * as React from "react";
import type { AuthTokens, CustomerDto, LoginRequest, RegisterRequest, RegisterResponse, VerifyOtpRequest } from "@tdm/types";
import { apiClient } from "@/lib/api-client";
import { decodeCustomerId, tokenStorage } from "@/lib/token-storage";

interface AuthContextValue {
  customerId: string | null;
  isAuthenticated: boolean;
  /** The logged-in customer's known details (name/email/phone) — null until GET /auth/me resolves, or if not logged in. */
  profile: CustomerDto | null;
  register: (input: RegisterRequest) => Promise<RegisterResponse>;
  verifyOtp: (input: VerifyOtpRequest) => Promise<void>;
  login: (input: LoginRequest) => Promise<void>;
  magicLogin: (token: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customerId, setCustomerId] = React.useState<string | null>(() => {
    const token = tokenStorage.getAccessToken();
    return token ? decodeCustomerId(token) : null;
  });
  const [profile, setProfile] = React.useState<CustomerDto | null>(null);

  React.useEffect(() => {
    if (!customerId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    apiClient
      .get<CustomerDto>("/auth/me")
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const applyTokens = React.useCallback((tokens: AuthTokens) => {
    tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    setCustomerId(decodeCustomerId(tokens.accessToken));
  }, []);

  const register = React.useCallback(async (input: RegisterRequest) => {
    const { data } = await apiClient.post<RegisterResponse>("/auth/register", input);
    return data;
  }, []);

  const verifyOtp = React.useCallback(async (input: VerifyOtpRequest) => {
    await apiClient.post("/auth/verify-otp", input);
  }, []);

  const login = React.useCallback(
    async (input: LoginRequest) => {
      const { data } = await apiClient.post<AuthTokens>("/auth/login", input);
      applyTokens(data);
    },
    [applyTokens],
  );

  const magicLogin = React.useCallback(
    async (token: string) => {
      const { data } = await apiClient.post<AuthTokens>("/auth/magic-login", { token });
      applyTokens(data);
    },
    [applyTokens],
  );

  const forgotPassword = React.useCallback(async (email: string) => {
    await apiClient.post("/auth/forgot-password", { email });
  }, []);

  const resetPassword = React.useCallback(async (token: string, newPassword: string) => {
    await apiClient.post("/auth/reset-password", { token, newPassword });
  }, []);

  const logout = React.useCallback(() => {
    tokenStorage.clear();
    setCustomerId(null);
  }, []);

  const value = React.useMemo(
    () => ({
      customerId,
      isAuthenticated: !!customerId,
      profile,
      register,
      verifyOtp,
      login,
      magicLogin,
      forgotPassword,
      resetPassword,
      logout,
    }),
    [customerId, profile, register, verifyOtp, login, magicLogin, forgotPassword, resetPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}
