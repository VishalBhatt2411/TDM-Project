/**
 * Non-destructive update: attaches real Primary_Image_Url__c / Gallery_Urls__c
 * to existing Vehicle__c records by matching Model__c, without touching
 * Booking__c, Sales_Rep__c, Branch__c, or Vehicle_Variant__c records.
 *
 * Usage: node update-vehicle-images.mjs
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

const IMAGE_CATEGORY_BY_MODEL = {
  "Glanza": "hatchback",
  "Urban Cruiser Taisor": "suv",
  "Urban Cruiser Hyryder": "suv",
  "Rumion": "mpv",
  "Innova Crysta": "mpv",
  "Innova Hycross": "mpv",
  "Fortuner": "suv",
  "Fortuner Legender": "suv",
  "Hilux": "pickup",
  "Camry": "luxury_sedan",
  "Vellfire": "luxury_mpv",
};
const IMAGE_COUNT_BY_CATEGORY = {
  hatchback: 4,
  suv: 3,
  mpv: 4,
  pickup: 4,
  luxury_sedan: 4,
  luxury_mpv: 4,
};
function galleryUrlsFor(model) {
  const category = IMAGE_CATEGORY_BY_MODEL[model];
  if (!category) return [];
  const count = IMAGE_COUNT_BY_CATEGORY[category];
  return Array.from({ length: count }, (_, i) => `/vehicle-images/${category}/${i + 1}.jpg`);
}

async function main() {
  const conn = await getConnection();
  const result = await conn.query("SELECT Id, Model__c FROM Vehicle__c");
  console.log(`Found ${result.records.length} vehicles.`);

  const updates = [];
  for (const record of result.records) {
    const urls = galleryUrlsFor(record.Model__c);
    if (urls.length === 0) {
      console.log(`  Skipping ${record.Model__c} (Id ${record.Id}) — no image mapping.`);
      continue;
    }
    updates.push({
      Id: record.Id,
      Primary_Image_Url__c: urls[0],
      Gallery_Urls__c: JSON.stringify(urls),
    });
  }

  if (updates.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  const updateResults = await conn.sobject("Vehicle__c").update(updates);
  const list = Array.isArray(updateResults) ? updateResults : [updateResults];
  let ok = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].success) {
      ok++;
      console.log(`  Updated ${updates[i].Id}: ${updates[i].Primary_Image_Url__c}`);
    } else {
      console.error(`  Failed ${updates[i].Id}:`, list[i].errors);
    }
  }
  console.log(`\nDone. Updated ${ok}/${updates.length} vehicles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
