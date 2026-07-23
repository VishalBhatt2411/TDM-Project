/**
 * Adds a realistic spread of demo Booking__c (+ Drive_Feedback__c for completed
 * ones) records so the new LWC dashboard has meaningful data to visualize.
 * Non-destructive: does not touch existing bookings, reuses the org's existing
 * sample Contacts, and the catalog's existing Vehicle__c/Sales_Rep__c/Branch__c records.
 *
 * Usage: node seed-demo-bookings.mjs
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import jsforce from "jsforce";

const execFileAsync = promisify(execFile);

async function getConnection() {
  const { stdout } = await execFileAsync(
    "sf",
    ["org", "display", "--target-org", "tdm-dev", "--json"],
    { env: { ...process.env, SF_TEMP_SHOW_SECRETS: "true" }, shell: process.platform === "win32" },
  );
  const { result } = JSON.parse(stdout);
  return new jsforce.Connection({ accessToken: result.accessToken, instanceUrl: result.instanceUrl });
}

const STATUS_WEIGHTS = [
  ["Completed", 14],
  ["Confirmed", 6],
  ["Requested", 4],
  ["Cancelled", 3],
  ["NoShow", 2],
  ["Waitlisted", 2],
];

function pickWeighted(weights) {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of weights) {
    if (r < w) return value;
    r -= w;
  }
  return weights[0][0];
}

function daysFromNow(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const conn = await getConnection();

  const [contacts, vehicles, reps, branches] = await Promise.all([
    conn.query("SELECT Id FROM Contact LIMIT 25"),
    conn.query("SELECT Id FROM Vehicle__c"),
    conn.query("SELECT Id FROM Sales_Rep__c WHERE Is_Active__c = true"),
    conn.query("SELECT Id FROM Branch__c"),
  ]);

  if (!contacts.records.length || !vehicles.records.length || !reps.records.length || !branches.records.length) {
    throw new Error("Missing prerequisite data (contacts/vehicles/reps/branches) — run seed-catalog.mjs first.");
  }

  const bookingRecords = [];
  const DRIVE_TYPES = ["Dealership", "Home"];
  const TOTAL = 36;

  for (let i = 0; i < TOTAL; i++) {
    const status = pickWeighted(STATUS_WEIGHTS);
    // Spread across the last 45 days through the next 10 days.
    const dayOffset = Math.floor(Math.random() * 55) - 45;
    const isPast = dayOffset < 0;
    // Future bookings shouldn't already be Completed/Cancelled/NoShow.
    const effectiveStatus = !isPast && ["Completed", "Cancelled", "NoShow"].includes(status) ? "Confirmed" : status;
    const hour = 9 + Math.floor(Math.random() * 9);
    const start = daysFromNow(dayOffset, hour);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    bookingRecords.push({
      Contact__c: contacts.records[i % contacts.records.length].Id,
      Vehicle__c: vehicles.records[i % vehicles.records.length].Id,
      Branch__c: branches.records[i % branches.records.length].Id,
      Sales_Rep__c: reps.records[i % reps.records.length].Id,
      Drive_Type__c: DRIVE_TYPES[i % DRIVE_TYPES.length],
      Scheduled_Start__c: start.toISOString(),
      Scheduled_End__c: end.toISOString(),
      Status__c: effectiveStatus,
      Is_Existing_Customer__c: i % 4 === 0,
      Purchase_Timeline__c: ["Immediate", "Within_1_Month", "Within_3_Months", "Just_Exploring"][i % 4],
    });
  }

  console.log(`Creating ${bookingRecords.length} demo bookings...`);
  const results = await conn.sobject("Booking__c").create(bookingRecords);
  const list = Array.isArray(results) ? results : [results];
  let created = 0;
  const completedBookingIds = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].success) {
      created++;
      if (bookingRecords[i].Status__c === "Completed") completedBookingIds.push(list[i].id);
    } else {
      console.error("  Failed:", list[i].errors);
    }
  }
  console.log(`  Created ${created}/${bookingRecords.length} bookings.`);

  console.log(`Creating feedback for ${completedBookingIds.length} completed drives...`);
  const feedbackRecords = completedBookingIds.map((bookingId, i) => {
    const nps = 6 + (i % 5); // spread 6-10, skewed positive
    return {
      Booking__c: bookingId,
      Customer_Rating__c: 3 + (i % 3),
      Interest_Level__c: ["Low", "Medium", "High"][i % 3],
      Purchase_Interest__c: i % 3 !== 0,
      Vehicle_Performance_Rating__c: 3 + (i % 3),
      Comfort_Rating__c: 3 + ((i + 1) % 3),
      Features_Rating__c: 3 + ((i + 2) % 3),
      Staff_Experience_Rating__c: 4 + (i % 2),
      Dealership_Experience_Rating__c: 4 + ((i + 1) % 2),
      NPS_Score__c: nps,
      Is_Survey_Response__c: true,
    };
  });
  if (feedbackRecords.length) {
    const feedbackResults = await conn.sobject("Drive_Feedback__c").create(feedbackRecords);
    const feedbackList = Array.isArray(feedbackResults) ? feedbackResults : [feedbackResults];
    console.log(`  Created ${feedbackList.filter((r) => r.success).length}/${feedbackRecords.length} feedback records.`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
