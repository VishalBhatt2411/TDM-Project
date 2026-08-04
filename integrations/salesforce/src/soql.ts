import { Connection } from "jsforce";
import { SalesforceConnectionProvider } from "./connection";

/**
 * Runs `fn` with a connection, and retries exactly once after invalidating
 * the cached connection if the first attempt fails with an INVALID_SESSION_ID
 * style auth error (access token expired mid-flight).
 */
export async function withConnection<T>(
  provider: SalesforceConnectionProvider,
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

export const CONTACT_FIELDS =
  "Id, FirstName, LastName, Email, Phone, Portal_User_Id__c, Preferred_Language__c, Marketing_Opt_In__c, " +
  "Email_Verified__c, Phone_Verified__c, License_Number__c, License_Verified__c, CreatedDate";

export const VEHICLE_FIELDS =
  "Id, Make__c, Model__c, Trim__c, Year__c, VIN__c, Body_Type__c, Fuel_Type__c, Transmission__c, Color__c, " +
  "Price__c, Price_Max__c, Odometer__c, Status__c, Branch__c, Is_Featured__c, Is_Best_Seller__c, Is_New_Launch__c, " +
  "Availability_Status__c, Seating_Capacity__c, Mileage_Kmpl__c, Safety_Rating__c, Primary_Image_Url__c, " +
  "Gallery_Urls__c, Video_Url__c, Spec_Sheet_Json__c, Accessories_Json__c, Description__c, Engine_Options_Json__c, " +
  "Safety_Features_Json__c, Infotainment_Features_Json__c, Exterior_Highlights_Json__c, Interior_Highlights_Json__c, " +
  "Colors_Json__c, Faqs_Json__c";

export const VEHICLE_VARIANT_FIELDS =
  "Id, Name, Vehicle__c, Price__c, Engine__c, Fuel_Type__c, Transmission__c, Is_Default__c, Display_Order__c";

export const BRANCH_FIELDS =
  "Id, Name, Address__c, City__c, State__c, Postal_Code__c, Country__c, Latitude__c, Longitude__c, " +
  "Phone__c, Email__c, Operating_Hours__c, Manager_Name__c, Is_Active__c";

export const BOOKING_FIELDS =
  "Id, Contact__c, Contact__r.Portal_User_Id__c, Contact__r.FirstName, Contact__r.LastName, Contact__r.Email, " +
  "Vehicle__c, Branch__c, OwnerId, Drive_Type__c, " +
  "Scheduled_Start__c, Scheduled_End__c, Status__c, Home_Address__c, Check_In_Method__c, Check_In_Timestamp__c, " +
  "Actual_Start__c, Actual_End__c, Odometer_Start__c, Odometer_End__c, Cancellation_Reason__c, " +
  "Rescheduled_From__c, Waitlist_Position__c, CreatedDate, City__c, State__c, Preferred_Variant__c, " +
  "Is_Existing_Customer__c, Current_Vehicle_Owned__c, Purchase_Timeline__c, Pickup_Required__c, Additional_Notes__c, " +
  "Staff_Notes__c";

export const DRIVE_FEEDBACK_FIELDS =
  "Id, Booking__c, Customer_Rating__c, Customer_Comments__c, Rep_Notes__c, Interest_Level__c, Objections_Raised__c, " +
  "Submitted_By__c, Purchase_Interest__c, Vehicle_Performance_Rating__c, Comfort_Rating__c, Features_Rating__c, " +
  "Staff_Experience_Rating__c, Dealership_Experience_Rating__c, NPS_Score__c, Is_Survey_Response__c";
