export type LanguageCode = "en" | "hi" | "es" | "fr";

export interface CustomerDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredLanguage: LanguageCode;
  marketingOptIn: boolean;
  licenseVerified: boolean;
  createdAt: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  preferredLanguage?: LanguageCode;
  marketingOptIn?: boolean;
}

export interface RegisterResponse {
  customerId: string;
  otpChannel: "sms" | "email";
}

export interface VerifyOtpRequest {
  customerId: string;
  code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface UpdateCustomerRequest {
  firstName?: string;
  lastName?: string;
  preferredLanguage?: LanguageCode;
  marketingOptIn?: boolean;
}
