import "dotenv/config";

/**
 * The API's single, validated view of its environment. Evaluated once, on first import —
 * before AppModule's decorators run — so a missing/weak secret stops the process at boot
 * with an actionable message instead of silently falling back to an insecure default.
 *
 * Dev-only conveniences (localhost origins/redirects) apply only when NODE_ENV is not
 * "production"; in production every externally-reachable URL must be set explicitly
 * and served over HTTPS.
 */
export interface AppEnv {
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  encryptionKey: string;
  webOrigin: string;
  adminWebOrigin: string;
  corsOrigins: string[];
  trustProxyHops: number;
  enableApiDocs: boolean;
  /** Tenants' customer apps are served on "<org slug>.<tenantBaseDomain>" (plus any registered custom domain). */
  tenantBaseDomain: string;
  sfOAuthRedirectUri: string;
  sfOnboardingRedirectUri: string;
  anthropicApiKey?: string;
}

const MIN_JWT_SECRET_LENGTH = 32;

function loadEnv(source: NodeJS.ProcessEnv): AppEnv {
  const errors: string[] = [];
  const isProduction = source.NODE_ENV === "production";

  const read = (name: string): string | undefined => {
    const value = source[name]?.trim();
    return value ? value : undefined;
  };
  const required = (name: string): string => {
    const value = read(name);
    if (!value) errors.push(`${name} is required.`);
    return value ?? "";
  };
  /** Required in production; a localhost default is allowed only in development. */
  const url = (name: string, devDefault: string): string => {
    const value = read(name) ?? (isProduction ? undefined : devDefault);
    if (!value) {
      errors.push(`${name} is required in production.`);
      return "";
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      errors.push(`${name} must be an absolute URL.`);
      return value;
    }
    if (isProduction && parsed.protocol !== "https:") {
      errors.push(`${name} must use https in production.`);
    }
    return value.replace(/\/+$/, "");
  };

  required("DATABASE_URL");

  const jwtSecret = required("JWT_SECRET");
  if (jwtSecret && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters.`);
  }

  const encryptionKey = required("ENCRYPTION_KEY");
  if (encryptionKey && !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    errors.push("ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  }

  const port = Number(read("PORT") ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) errors.push("PORT must be a valid TCP port.");

  const trustProxyHops = Number(read("TRUST_PROXY_HOPS") ?? (isProduction ? 1 : 0));
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) errors.push("TRUST_PROXY_HOPS must be a non-negative integer.");

  const tenantBaseDomain = (read("TENANT_BASE_DOMAIN") ?? (isProduction ? "" : "localhost")).toLowerCase();
  if (!tenantBaseDomain) {
    errors.push("TENANT_BASE_DOMAIN is required in production.");
  } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(tenantBaseDomain)) {
    errors.push("TENANT_BASE_DOMAIN must be a bare hostname (no scheme, port or path), e.g. tdm.example.com.");
  }

  const webOrigin = url("WEB_ORIGIN", "http://localhost:5173");
  const adminWebOrigin = read("ADMIN_WEB_ORIGIN") ? url("ADMIN_WEB_ORIGIN", webOrigin) : webOrigin;

  const env: AppEnv = {
    isProduction,
    port,
    jwtSecret,
    encryptionKey,
    webOrigin,
    adminWebOrigin,
    corsOrigins: [...new Set([webOrigin, adminWebOrigin])],
    trustProxyHops,
    enableApiDocs: read("ENABLE_API_DOCS") ? read("ENABLE_API_DOCS") === "true" : !isProduction,
    tenantBaseDomain,
    sfOAuthRedirectUri: url("SF_OAUTH_REDIRECT_URI", "http://localhost:3000/api/v1/admin/auth/salesforce/callback"),
    sfOnboardingRedirectUri: url("SF_ONBOARDING_REDIRECT_URI", "http://localhost:3000/api/v1/onboarding/salesforce/callback"),
    anthropicApiKey: read("ANTHROPIC_API_KEY"),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join("\n  - ")}`);
  }
  return env;
}

export const env: AppEnv = loadEnv(process.env);
