import { Connection } from "jsforce";
import { SalesforceConnectionSource } from "./connection-source";

/**
 * Runs `fn` with a connection, and retries exactly once after invalidating
 * the cached connection if the first attempt fails with an INVALID_SESSION_ID
 * style auth error (access token expired mid-flight).
 */
export async function withConnection<T>(
  provider: SalesforceConnectionSource,
  fn: (conn: Connection) => Promise<T>,
): Promise<T> {
  const conn = await provider.getConnection();
  try {
    return await fn(conn);
  } catch (err: any) {
    const isAuthError = err?.errorCode === "INVALID_SESSION_ID" || err?.name === "invalid_grant";
    if (!isAuthError) throw err;
    await provider.invalidate();
    const freshConn = await provider.getConnection();
    return fn(freshConn);
  }
}

/**
 * A provider error reduced to what is safe to log: its code, never its message — Salesforce
 * messages routinely echo field values (email addresses, phone numbers, duplicate-rule matches).
 */
export function providerErrorCode(err: unknown): string {
  const e = err as { errorCode?: unknown; name?: unknown } | null;
  if (typeof e?.errorCode === "string") return e.errorCode;
  if (typeof e?.name === "string") return e.name;
  return "UNKNOWN";
}

/**
 * Escapes a value for safe interpolation inside a single-quoted SOQL string literal.
 * Backslash must be escaped first — otherwise a trailing backslash in the input would
 * combine with the escaped quote that follows it to produce an unescaped quote,
 * letting the value break out of the literal (e.g. input `\` immediately before a `'`).
 * Every repository builds queries by string interpolation (SOQL has no bind-parameter
 * API in jsforce), so this must wrap every non-constant value placed inside a query.
 */
export function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** escapeSoql for a LIKE pattern — also escapes the `%`/`_` wildcards so user input matches literally. */
export function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const ID_SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

/**
 * The case-insensitive 18-character form of a record id (a 15-character id gets its checksum
 * suffix, anything else passes through). Needed wherever an id is compared as text rather than as
 * an Id — e.g. a composite key built by Apex `String.valueOf(Id)`, which always yields 18 characters.
 */
export function toEighteenCharId(id: string): string {
  if (id.length !== 15) return id;
  let suffix = "";
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const c = id.charAt(chunk * 5 + i);
      if (c >= "A" && c <= "Z") bits |= 1 << i;
    }
    suffix += ID_SUFFIX_ALPHABET.charAt(bits);
  }
  return id + suffix;
}

/** `('a', 'b')` for an IN clause. Callers must handle an empty list (SOQL rejects `IN ()`). */
const SALESFORCE_ID_PATTERN = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

/** True for a 15/18-character record Id — an `Id IN (...)` filter rejects the whole query on any other value. */
export function isSalesforceId(value: string): boolean {
  return SALESFORCE_ID_PATTERN.test(value);
}

export function soqlIdList(ids: readonly string[]): string {
  return `(${ids.map((id) => `'${escapeSoql(id)}'`).join(", ")})`;
}

/**
 * The SOQL condition for a DealershipScope on `field` (e.g. `Dealership__c`, `Booking__r.Dealership__c`),
 * or null when the scope is unrestricted. An empty scope yields a condition that matches nothing.
 */
export function dealershipCondition(field: string, dealershipIds: readonly string[] | undefined): string | null {
  if (!dealershipIds) return null;
  return dealershipIds.length ? `${field} IN ${soqlIdList(dealershipIds)}` : "Id = null";
}

export const CONTACT_FIELDS =
  "Id, FirstName, LastName, Email, Phone, Portal_User_Id__c, Preferred_Language__c, Marketing_Opt_In__c, " +
  "Email_Verified__c, Phone_Verified__c, License_Number__c, License_Verified__c, CreatedDate";

export const VEHICLE_FIELDS =
  "Id, Make__c, Model__c, Trim__c, Year__c, VIN__c, Body_Type__c, Fuel_Type__c, Transmission__c, Color__c, " +
  "Price__c, Price_Max__c, Odometer__c, Status__c, Dealership__c, Branch__c, Is_Featured__c, Is_Best_Seller__c, Is_New_Launch__c, " +
  "Availability_Status__c, Seating_Capacity__c, Mileage_Kmpl__c, Safety_Rating__c, Primary_Image_Url__c, " +
  "Gallery_Urls__c, Video_Url__c, Spec_Sheet_Json__c, Accessories_Json__c, Description__c, Engine_Options_Json__c, " +
  "Safety_Features_Json__c, Infotainment_Features_Json__c, Exterior_Highlights_Json__c, Interior_Highlights_Json__c, " +
  "Colors_Json__c, Faqs_Json__c";

export const VEHICLE_VARIANT_FIELDS =
  "Id, Name, Vehicle__c, Price__c, Engine__c, Fuel_Type__c, Transmission__c, Is_Default__c, Display_Order__c";

export const BRANCH_FIELDS =
  "Id, Name, Dealership__c, Address__c, City__c, State__c, Postal_Code__c, Country__c, Latitude__c, Longitude__c, " +
  "Phone__c, Email__c, Operating_Hours__c, Manager_Name__c, Is_Active__c";

export const BRANDING_FIELDS =
  "Tagline__c, Logo_Text__c, Logo_Url__c, Primary_Color_Hex__c, Phone__c, Email__c, Address__c, Operating_Hours__c";

export const DEALERSHIP_FIELDS = `Id, Name, Is_Active__c, ${BRANDING_FIELDS}`;

export const BOOKING_FIELDS =
  "Id, Contact__c, Contact__r.Portal_User_Id__c, Contact__r.FirstName, Contact__r.LastName, Contact__r.Email, " +
  "Vehicle__c, Dealership__c, Branch__c, OwnerId, Drive_Type__c, " +
  "Scheduled_Start__c, Scheduled_End__c, Status__c, Home_Address__c, Check_In_Method__c, Check_In_Timestamp__c, " +
  "Actual_Start__c, Actual_End__c, Odometer_Start__c, Odometer_End__c, Cancellation_Reason__c, " +
  "Rescheduled_From__c, Waitlist_Position__c, CreatedDate, City__c, State__c, Preferred_Variant__c, " +
  "Is_Existing_Customer__c, Current_Vehicle_Owned__c, Purchase_Timeline__c, Pickup_Required__c, Additional_Notes__c, " +
  "Staff_Notes__c";

export const STAFF_ASSIGNMENT_FIELDS =
  "Id, User__c, User__r.Name, User__r.Email, Role__c, Dealership__c, Branch__c, Is_Active__c, " +
  "Max_Daily_Bookings__c, Phone__c";

export const COMPLIANCE_RECORD_FIELDS =
  "Id, Booking__c, Otp_Verified__c, License_Number__c, License_Verified__c, License_Image_Url__c, " +
  "License_Expiry_Date__c, Consent_Accepted__c, Consent_Document_Url__c, Signature_Image_Url__c, Signed_At__c";

export const DRIVE_FEEDBACK_FIELDS =
  "Id, Booking__c, Customer_Rating__c, Customer_Comments__c, Rep_Notes__c, Interest_Level__c, Objections_Raised__c, " +
  "Submitted_By__c, Purchase_Interest__c, Vehicle_Performance_Rating__c, Comfort_Rating__c, Features_Rating__c, " +
  "Staff_Experience_Rating__c, Dealership_Experience_Rating__c, NPS_Score__c, Is_Survey_Response__c";
