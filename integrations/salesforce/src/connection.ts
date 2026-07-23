import { execFile } from "node:child_process";
import { promisify } from "node:util";
import jsforce, { Connection } from "jsforce";

const execFileAsync = promisify(execFile);

interface SfOrgDisplayResult {
  result: {
    accessToken: string;
    instanceUrl: string;
    apiVersion?: string;
  };
}

/**
 * Provides an authenticated jsforce Connection for the configured org.
 *
 * Dev-mode strategy: rather than storing a Salesforce username/password or a
 * long-lived refresh token in this codebase, we shell out to the already-authenticated
 * `sf` CLI session (`sf org display`) to mint a short-lived access token on demand.
 * This keeps zero Salesforce credentials in the repo or environment beyond an org alias.
 *
 * Production hardening path (tracked for Phase 12+): swap this for a Connected App
 * using the JWT Bearer flow with a dedicated integration user, so the adapter no
 * longer depends on a developer's local CLI session.
 */
export class SalesforceConnectionProvider {
  private cachedConnection: Connection | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 25 * 60 * 1000; // access tokens from `sf` are valid ~2h; refresh well before that
  /** Dedupes concurrent refreshes — without this, N simultaneous callers each spawn
   *  their own `sf org display` subprocess, which can race against the CLI's own
   *  session cache and intermittently fail. */
  private refreshInFlight: Promise<Connection> | null = null;

  constructor(private readonly orgAlias: string = process.env.SF_TARGET_ORG_ALIAS ?? "tdm-dev") {}

  async getConnection(): Promise<Connection> {
    const isStale = Date.now() - this.cachedAt > this.ttlMs;
    if (this.cachedConnection && !isStale) {
      return this.cachedConnection;
    }

    this.refreshInFlight ??= this.createConnection().finally(() => {
      this.refreshInFlight = null;
    });
    this.cachedConnection = await this.refreshInFlight;
    this.cachedAt = Date.now();
    return this.cachedConnection;
  }

  /** Call after a request fails with an auth/session error to force a fresh token. */
  async invalidate(): Promise<void> {
    this.cachedConnection = null;
  }

  private async createConnection(): Promise<Connection> {
    const { accessToken, instanceUrl, apiVersion } = await this.fetchAccessToken();
    return new Connection({ accessToken, instanceUrl, version: apiVersion ?? "62.0" });
  }

  private async fetchAccessToken(): Promise<{ accessToken: string; instanceUrl: string; apiVersion?: string }> {
    const { stdout } = await execFileAsync("sf", [
      "org",
      "display",
      "--target-org",
      this.orgAlias,
      "--json",
    ], {
      env: { ...process.env, SF_TEMP_SHOW_SECRETS: "true" },
      shell: process.platform === "win32",
    });

    const parsed: SfOrgDisplayResult = JSON.parse(stdout);
    if (!parsed.result?.accessToken || !parsed.result?.instanceUrl) {
      throw new Error(
        `Could not obtain a Salesforce access token for org alias "${this.orgAlias}". ` +
          `Ensure it's authenticated via "sf org login web --alias ${this.orgAlias}".`,
      );
    }
    return {
      accessToken: parsed.result.accessToken,
      instanceUrl: parsed.result.instanceUrl,
      apiVersion: parsed.result.apiVersion,
    };
  }
}
