import * as React from "react";
import type { AuthTokens, LoginRequest, RegisterRequest, RegisterResponse, VerifyOtpRequest } from "@tdm/types";
import { apiClient } from "@/lib/api-client";
import { decodeCustomerId, tokenStorage } from "@/lib/token-storage";

interface AuthContextValue {
  customerId: string | null;
  isAuthenticated: boolean;
  register: (input: RegisterRequest) => Promise<RegisterResponse>;
  verifyOtp: (input: VerifyOtpRequest) => Promise<void>;
  login: (input: LoginRequest) => Promise<void>;
  magicLogin: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customerId, setCustomerId] = React.useState<string | null>(() => {
    const token = tokenStorage.getAccessToken();
    return token ? decodeCustomerId(token) : null;
  });

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

  const logout = React.useCallback(() => {
    tokenStorage.clear();
    setCustomerId(null);
  }, []);

  const value = React.useMemo(
    () => ({ customerId, isAuthenticated: !!customerId, register, verifyOtp, login, magicLogin, logout }),
    [customerId, register, verifyOtp, login, magicLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}
