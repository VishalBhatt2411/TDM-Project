import { Connection } from "jsforce";

/**
 * What every Salesforce repository needs from "a connection": an authenticated jsforce
 * Connection for the org the current unit of work belongs to, plus the identity that
 * connection runs as. Repositories are stateless singletons — which org they talk to is
 * decided per call by the implementation (see TenantSalesforceConnectionProvider).
 */
export interface SalesforceConnectionSource {
  getConnection(): Promise<Connection>;
  /**
   * The Salesforce User id this app's connection authenticates as — every Booking__c
   * defaults to being owned by this identity until a real rep is assigned (OwnerId can
   * never be blank), so this id is what "unassigned" actually looks like on the record.
   */
  getIntegrationUserId(): Promise<string>;
  /** Salesforce org id (`00D...`) the connection is authenticated against. */
  getSalesforceOrgId(): Promise<string>;
  /** Call after a request fails with an auth/session error to force a fresh token. */
  invalidate(): Promise<void>;
  /** Round-trips to the org — used by health checks. Throws when the org is unreachable. */
  ping(): Promise<void>;
}
