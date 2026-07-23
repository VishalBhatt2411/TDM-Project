import {
  Branch,
  Booking,
  ComplianceRecord,
  Customer,
  DriveFeedback,
  Email,
  EngineOption,
  Money,
  PersonName,
  PhoneNumber,
  SalesOpportunity,
  SalesRepresentative,
  TimeSlot,
  Vehicle,
  VehicleAllocation,
  VehicleColor,
  VehicleFaq,
  VehicleVariant,
  WishlistItem,
} from "@tdm/domain";

export function contactToCustomer(record: any): Customer {
  return Customer.restore({
    id: record.Portal_User_Id__c,
    name: PersonName.create(record.FirstName ?? "", record.LastName ?? ""),
    email: Email.create(record.Email),
    phone: PhoneNumber.create(record.Phone ?? record.MobilePhone),
    emailVerified: !!record.Email_Verified__c,
    phoneVerified: !!record.Phone_Verified__c,
    preferredLanguage: record.Preferred_Language__c ?? "en",
    marketingOptIn: !!record.Marketing_Opt_In__c,
    createdAt: new Date(record.CreatedDate ?? Date.now()),
  });
}

export function customerToContactRecord(customer: Customer): Record<string, unknown> {
  const props = customer.toProps();
  return {
    FirstName: props.name.firstName,
    LastName: props.name.lastName,
    Email: props.email.value,
    Phone: props.phone.value,
    Portal_User_Id__c: props.id,
    Preferred_Language__c: props.preferredLanguage,
    Marketing_Opt_In__c: props.marketingOptIn,
    Email_Verified__c: props.emailVerified,
    Phone_Verified__c: props.phoneVerified,
    License_Number__c: props.license?.number,
    License_Verified__c: props.license?.verified ?? false,
  };
}

export function vehicleRecordToDomain(record: any): Vehicle {
  return Vehicle.restore({
    id: record.Id,
    make: record.Make__c,
    model: record.Model__c,
    trim: record.Trim__c ?? undefined,
    year: record.Year__c,
    vin: record.VIN__c,
    bodyType: record.Body_Type__c,
    fuelType: record.Fuel_Type__c,
    transmission: record.Transmission__c,
    color: record.Color__c ?? undefined,
    price: Money.create(record.Price__c ?? 0, "INR"),
    priceMax: record.Price_Max__c != null ? Money.create(record.Price_Max__c, "INR") : undefined,
    odometer: record.Odometer__c ?? 0,
    status: record.Status__c,
    branchId: record.Branch__c,
    isFeatured: !!record.Is_Featured__c,
    isBestSeller: !!record.Is_Best_Seller__c,
    isNewLaunch: !!record.Is_New_Launch__c,
    availabilityStatus: record.Availability_Status__c ?? "In_Stock",
    seatingCapacity: record.Seating_Capacity__c ?? undefined,
    mileageKmpl: record.Mileage_Kmpl__c ?? undefined,
    safetyRatingStars: record.Safety_Rating__c ?? undefined,
    primaryImageUrl: record.Primary_Image_Url__c ?? undefined,
    galleryUrls: safeJsonArray(record.Gallery_Urls__c),
    videoUrl: record.Video_Url__c ?? undefined,
    specSheet: safeJsonObject(record.Spec_Sheet_Json__c),
    accessories: safeJsonArray(record.Accessories_Json__c),
    description: record.Description__c ?? undefined,
    engineOptions: safeJsonTyped<EngineOption>(record.Engine_Options_Json__c),
    safetyFeatures: safeJsonArray(record.Safety_Features_Json__c),
    infotainmentFeatures: safeJsonArray(record.Infotainment_Features_Json__c),
    exteriorHighlights: safeJsonArray(record.Exterior_Highlights_Json__c),
    interiorHighlights: safeJsonArray(record.Interior_Highlights_Json__c),
    colors: safeJsonTyped<VehicleColor>(record.Colors_Json__c),
    faqs: safeJsonTyped<VehicleFaq>(record.Faqs_Json__c),
  });
}

export function vehicleToUpdateRecord(vehicle: Vehicle): Record<string, unknown> {
  const props = vehicle.toProps();
  return { Status__c: props.status, Odometer__c: props.odometer };
}

export function variantRecordToDomain(record: any): VehicleVariant {
  return VehicleVariant.restore({
    id: record.Id,
    vehicleId: record.Vehicle__c,
    name: record.Name,
    price: Money.create(record.Price__c ?? 0, "INR"),
    engine: record.Engine__c ?? undefined,
    fuelType: record.Fuel_Type__c,
    transmission: record.Transmission__c,
    isDefault: !!record.Is_Default__c,
    displayOrder: record.Display_Order__c ?? 0,
  });
}

export function branchRecordToDomain(record: any): Branch {
  return Branch.restore({
    id: record.Id,
    name: record.Name,
    address: {
      line1: record.Address__c ?? "",
      city: record.City__c ?? "",
      state: record.State__c ?? "",
      postalCode: record.Postal_Code__c ?? "",
      country: record.Country__c ?? "",
    },
    geo:
      record.Latitude__c != null && record.Longitude__c != null
        ? { latitude: record.Latitude__c, longitude: record.Longitude__c }
        : undefined,
    phone: record.Phone__c ?? undefined,
    email: record.Email__c ?? undefined,
    operatingHours: record.Operating_Hours__c ?? undefined,
    managerName: record.Manager_Name__c ?? undefined,
    isActive: !!record.Is_Active__c,
  });
}

export function salesRepRecordToDomain(record: any): SalesRepresentative {
  return SalesRepresentative.restore({
    id: record.Id,
    name: record.Name,
    email: record.Email__c,
    phone: record.Phone__c ?? undefined,
    branchId: record.Branch__c,
    isActive: !!record.Is_Active__c,
    maxDailyBookings: record.Max_Daily_Bookings__c ?? undefined,
  });
}

export function bookingRecordToDomain(record: any): Booking {
  return Booking.restore({
    id: record.Id,
    customerId: record.Contact__r?.Portal_User_Id__c ?? record.Contact__c,
    vehicleId: record.Vehicle__c,
    branchId: record.Branch__c,
    salesRepId: record.Sales_Rep__c ?? undefined,
    driveType: record.Drive_Type__c,
    slot: TimeSlot.create(record.Scheduled_Start__c, record.Scheduled_End__c),
    status: record.Status__c,
    homeAddress: record.Home_Address__c
      ? { line1: record.Home_Address__c, city: "", state: "", postalCode: "", country: "" }
      : undefined,
    checkInMethod: record.Check_In_Method__c ?? undefined,
    checkInTimestamp: record.Check_In_Timestamp__c ? new Date(record.Check_In_Timestamp__c) : undefined,
    actualStart: record.Actual_Start__c ? new Date(record.Actual_Start__c) : undefined,
    actualEnd: record.Actual_End__c ? new Date(record.Actual_End__c) : undefined,
    odometerStart: record.Odometer_Start__c ?? undefined,
    odometerEnd: record.Odometer_End__c ?? undefined,
    cancellationReason: record.Cancellation_Reason__c ?? undefined,
    rescheduledFromBookingId: record.Rescheduled_From__c ?? undefined,
    waitlistPosition: record.Waitlist_Position__c ?? undefined,
    createdAt: new Date(record.CreatedDate ?? Date.now()),
    city: record.City__c ?? undefined,
    state: record.State__c ?? undefined,
    preferredVariantId: record.Preferred_Variant__c ?? undefined,
    isExistingCustomer: !!record.Is_Existing_Customer__c,
    currentVehicleOwned: record.Current_Vehicle_Owned__c ?? undefined,
    purchaseTimeline: record.Purchase_Timeline__c ?? "Just_Exploring",
    pickupRequired: !!record.Pickup_Required__c,
    additionalNotes: record.Additional_Notes__c ?? undefined,
  });
}

/** Customer name/email captured alongside a booking row, for notification purposes
 *  (avoids a second query when the automation layer needs "who to email"). */
export function bookingRecordCustomerContact(record: any): { firstName: string; lastName: string; email: string } {
  return {
    firstName: record.Contact__r?.FirstName ?? "",
    lastName: record.Contact__r?.LastName ?? "",
    email: record.Contact__r?.Email ?? "",
  };
}

export function bookingToRecord(booking: Booking): Record<string, unknown> {
  const props = booking.toProps();
  return {
    Contact__c: props.customerId,
    Vehicle__c: props.vehicleId,
    Branch__c: props.branchId,
    Sales_Rep__c: props.salesRepId ?? null,
    Drive_Type__c: props.driveType,
    Scheduled_Start__c: props.slot.start.toISOString(),
    Scheduled_End__c: props.slot.end.toISOString(),
    Status__c: props.status,
    Home_Address__c: props.homeAddress?.line1 ?? null,
    Check_In_Method__c: props.checkInMethod ?? null,
    Check_In_Timestamp__c: props.checkInTimestamp?.toISOString() ?? null,
    Actual_Start__c: props.actualStart?.toISOString() ?? null,
    Actual_End__c: props.actualEnd?.toISOString() ?? null,
    Odometer_Start__c: props.odometerStart ?? null,
    Odometer_End__c: props.odometerEnd ?? null,
    Cancellation_Reason__c: props.cancellationReason ?? null,
    Rescheduled_From__c: props.rescheduledFromBookingId ?? null,
    Waitlist_Position__c: props.waitlistPosition ?? null,
    City__c: props.city ?? null,
    State__c: props.state ?? null,
    Preferred_Variant__c: props.preferredVariantId ?? null,
    Is_Existing_Customer__c: props.isExistingCustomer,
    Current_Vehicle_Owned__c: props.currentVehicleOwned ?? null,
    Purchase_Timeline__c: props.purchaseTimeline,
    Pickup_Required__c: props.pickupRequired,
    Additional_Notes__c: props.additionalNotes ?? null,
  };
}

export function complianceToRecord(compliance: ComplianceRecord): Record<string, unknown> {
  const props = compliance.toProps();
  return {
    Booking__c: props.bookingId,
    Otp_Verified__c: props.otpVerified,
    License_Number__c: props.licenseNumber ?? null,
    License_Verified__c: props.licenseVerified,
    License_Image_Url__c: props.licenseImageUrl ?? null,
    License_Expiry_Date__c: props.licenseExpiryDate ? toDateOnly(props.licenseExpiryDate) : null,
    Consent_Accepted__c: props.consentAccepted,
    Consent_Document_Url__c: props.consentDocumentUrl ?? null,
    Signature_Image_Url__c: props.signatureImageUrl ?? null,
    Signed_At__c: props.signedAt?.toISOString() ?? null,
  };
}

export function feedbackToRecord(feedback: DriveFeedback): Record<string, unknown> {
  const props = feedback.toProps();
  return {
    Booking__c: props.bookingId,
    Customer_Rating__c: props.customerRating ?? null,
    Customer_Comments__c: props.customerComments ?? null,
    Rep_Notes__c: props.repNotes ?? null,
    Interest_Level__c: props.interestLevel,
    Objections_Raised__c: props.objectionsRaised ?? null,
    Submitted_By__c: props.submittedBy,
    Purchase_Interest__c: props.purchaseInterest,
    Vehicle_Performance_Rating__c: props.vehiclePerformanceRating ?? null,
    Comfort_Rating__c: props.comfortRating ?? null,
    Features_Rating__c: props.featuresRating ?? null,
    Staff_Experience_Rating__c: props.staffExperienceRating ?? null,
    Dealership_Experience_Rating__c: props.dealershipExperienceRating ?? null,
    NPS_Score__c: props.npsScore ?? null,
    Is_Survey_Response__c: props.isSurveyResponse,
  };
}

export function feedbackRecordToDomain(record: any): DriveFeedback {
  return DriveFeedback.create({
    id: record.Id,
    bookingId: record.Booking__c,
    customerRating: record.Customer_Rating__c ?? undefined,
    customerComments: record.Customer_Comments__c ?? undefined,
    repNotes: record.Rep_Notes__c ?? undefined,
    interestLevel: record.Interest_Level__c ?? "Medium",
    objectionsRaised: record.Objections_Raised__c ?? undefined,
    submittedBy: record.Submitted_By__c ?? "Customer",
    purchaseInterest: !!record.Purchase_Interest__c,
    vehiclePerformanceRating: record.Vehicle_Performance_Rating__c ?? undefined,
    comfortRating: record.Comfort_Rating__c ?? undefined,
    featuresRating: record.Features_Rating__c ?? undefined,
    staffExperienceRating: record.Staff_Experience_Rating__c ?? undefined,
    dealershipExperienceRating: record.Dealership_Experience_Rating__c ?? undefined,
    npsScore: record.NPS_Score__c ?? undefined,
    isSurveyResponse: !!record.Is_Survey_Response__c,
  });
}

export function wishlistRecordToDomain(record: any): WishlistItem {
  return WishlistItem.create({
    id: record.Id,
    customerId: record.Contact__c,
    vehicleId: record.Vehicle__c,
    createdAt: new Date(record.CreatedDate ?? Date.now()),
  });
}

export function allocationRecordToDomain(record: any): VehicleAllocation {
  return VehicleAllocation.restore({
    id: record.Id,
    vehicleId: record.Vehicle__c,
    fromBranchId: record.From_Branch__c ?? undefined,
    toBranchId: record.To_Branch__c,
    transferDate: record.Transfer_Date__c ? new Date(record.Transfer_Date__c) : undefined,
    status: record.Status__c,
  });
}

export function allocationToRecord(allocation: VehicleAllocation): Record<string, unknown> {
  const props = allocation.toProps();
  return {
    Vehicle__c: props.vehicleId,
    From_Branch__c: props.fromBranchId ?? null,
    To_Branch__c: props.toBranchId,
    Transfer_Date__c: props.transferDate ? toDateOnly(props.transferDate) : null,
    Status__c: props.status,
  };
}

export function opportunityRecordToDomain(record: any): SalesOpportunity {
  return SalesOpportunity.restore({
    id: record.Id,
    bookingId: record.Booking__c,
    customerId: record.Booking__r?.Contact__r?.Portal_User_Id__c ?? "",
    vehicleId: record.Vehicle__c,
    stage: mapOpportunityStage(record.StageName),
    createdAt: new Date(record.CreatedDate ?? Date.now()),
  });
}

function mapOpportunityStage(stageName: string): "Identified" | "Pursuing" | "Won" | "Lost" {
  if (stageName === "Closed Won") return "Won";
  if (stageName === "Closed Lost") return "Lost";
  if (stageName === "Prospecting" || stageName === "Qualification") return "Identified";
  return "Pursuing";
}

function safeJsonArray(raw: unknown): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonTyped<T>(raw: unknown): T[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
