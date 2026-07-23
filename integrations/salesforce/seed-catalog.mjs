/**
 * Seeds the tdm-dev org with a realistic (illustrative, non-authoritative) Toyota
 * India lineup: branches, sales reps, vehicles + variants. Pricing/specs are
 * approximate demo data, not scraped from toyota.com — safe to re-run (idempotent
 * per VIN prefix check) but intended as a one-time / occasional reset script.
 *
 * Usage: node seed-catalog.mjs [--reset]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import jsforce from "jsforce";

const execFileAsync = promisify(execFile);
const RESET = process.argv.includes("--reset");

async function getConnection() {
  const { stdout } = await execFileAsync(
    "sf",
    ["org", "display", "--target-org", "tdm-dev", "--json"],
    { env: { ...process.env, SF_TEMP_SHOW_SECRETS: "true" }, shell: process.platform === "win32" },
  );
  const { result } = JSON.parse(stdout);
  return new jsforce.Connection({ accessToken: result.accessToken, instanceUrl: result.instanceUrl });
}

const BRANCHES = [
  { Name: "Toyota Indore - AB Road", City__c: "Indore", State__c: "Madhya Pradesh", Country__c: "India", Address__c: "AB Road, Near LIG Square", Postal_Code__c: "452008", Phone__c: "+917314000001", Email__c: "abroad@toyotaindore.example", Operating_Hours__c: "Mon-Sat 9:00 AM - 8:00 PM, Sun 10:00 AM - 6:00 PM", Manager_Name__c: "Rohit Sharma", Is_Active__c: true, Latitude__c: 22.6867, Longitude__c: 75.8627 },
  { Name: "Toyota Indore - Vijay Nagar", City__c: "Indore", State__c: "Madhya Pradesh", Country__c: "India", Address__c: "Vijay Nagar Square", Postal_Code__c: "452010", Phone__c: "+917314000002", Email__c: "vijaynagar@toyotaindore.example", Operating_Hours__c: "Mon-Sat 9:00 AM - 8:00 PM, Sun 10:00 AM - 6:00 PM", Manager_Name__c: "Priya Verma", Is_Active__c: true, Latitude__c: 22.7529, Longitude__c: 75.8937 },
];

const SALES_REPS = [
  { Name: "Amit Kulkarni", Email__c: "amit.kulkarni@toyotaindore.example", Phone__c: "+919000000001", Is_Active__c: true, Max_Daily_Bookings__c: 8 },
  { Name: "Sneha Joshi", Email__c: "sneha.joshi@toyotaindore.example", Phone__c: "+919000000002", Is_Active__c: true, Max_Daily_Bookings__c: 8 },
  { Name: "Rahul Deshmukh", Email__c: "rahul.deshmukh@toyotaindore.example", Phone__c: "+919000000003", Is_Active__c: true, Max_Daily_Bookings__c: 6 },
  { Name: "Neha Agarwal", Email__c: "neha.agarwal@toyotaindore.example", Phone__c: "+919000000004", Is_Active__c: true, Max_Daily_Bookings__c: 6 },
];

// All pricing (INR) and specs below are illustrative/approximate demo data for
// development purposes — not live or authoritative Toyota pricing.
const VEHICLES = [
  {
    make: "Toyota", model: "Glanza", trim: "", year: 2026, bodyType: "Hatchback", fuelType: "Petrol",
    transmission: "Manual", price: 664000, priceMax: 954000, seating: 5, mileage: 22.35, safetyStars: 4,
    isFeatured: true, isBestSeller: true, isNewLaunch: false, availability: "In_Stock",
    description: "A refined, feature-packed premium hatchback built on the trusted Toyota-Maruti alliance platform — efficient, comfortable, and easy to live with every day.",
    engineOptions: [{ name: "1.2L DualJet Petrol", displacement: "1197cc", power: "89 bhp", torque: "113 Nm" }],
    safetyFeatures: ["6 Airbags", "ABS with EBD", "Electronic Stability Program", "Hill Hold Assist", "ISOFIX Child Seat Mounts"],
    infotainment: ["9-inch SmartPlay Pro+ touchscreen", "Wireless Android Auto & Apple CarPlay", "Arkamys Sound Tuning", "Head-Up Display"],
    exterior: ["LED Projector Headlamps", "16-inch Dual-Tone Alloy Wheels", "LED DRLs"],
    interior: ["Dual-Tone Interior", "Rear AC Vents", "Push-Button Start"],
    colors: [{ name: "Bright Red", hex: "#C41E24" }, { name: "Speedy Blue", hex: "#1B3A6B" }, { name: "Pearl White", hex: "#F2F2F2" }],
    variants: [
      { name: "E", price: 664000, engine: "1.2L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: false },
      { name: "S", price: 754000, engine: "1.2L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: true },
      { name: "G", price: 854000, engine: "1.2L Petrol", fuelType: "Petrol", transmission: "CVT", isDefault: false },
      { name: "V", price: 954000, engine: "1.2L Petrol", fuelType: "Petrol", transmission: "CVT", isDefault: false },
    ],
    faqs: [
      { question: "Is the Glanza fuel efficient for city driving?", answer: "Yes — it delivers up to 22.35 km/l (ARAI-claimed) in the manual variant, among the best in its segment." },
      { question: "Does the Glanza come with a sunroof?", answer: "No, the Glanza does not offer a sunroof in any variant." },
    ],
  },
  {
    make: "Toyota", model: "Urban Cruiser Taisor", trim: "", year: 2026, bodyType: "SUV", fuelType: "Petrol",
    transmission: "Manual", price: 799000, priceMax: 1379000, seating: 5, mileage: 21.6, safetyStars: 4,
    isFeatured: true, isBestSeller: false, isNewLaunch: true, availability: "In_Stock",
    description: "A bold, coupe-styled compact SUV with a turbo-petrol option for spirited driving and a commanding road presence.",
    engineOptions: [
      { name: "1.2L DualJet Petrol", displacement: "1197cc", power: "89 bhp", torque: "113 Nm" },
      { name: "1.0L Turbo Boosterjet", displacement: "998cc", power: "99 bhp", torque: "148 Nm" },
    ],
    safetyFeatures: ["6 Airbags", "360-degree Camera", "ABS with EBD", "Electronic Stability Program", "TPMS"],
    infotainment: ["9-inch Touchscreen", "Wireless Android Auto & Apple CarPlay", "Arkamys Premium Sound"],
    exterior: ["Coupe-style Roofline", "LED Sequential Turn Indicators", "17-inch Alloy Wheels"],
    interior: ["Ventilated Front Seats", "Head-Up Display", "Wireless Charger"],
    colors: [{ name: "Grandeur Grey", hex: "#4A4A4A" }, { name: "Splendid Silver", hex: "#C6C6C6" }, { name: "Earthen Brown", hex: "#5C4033" }],
    variants: [
      { name: "E", price: 799000, engine: "1.2L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: false },
      { name: "S Turbo", price: 1029000, engine: "1.0L Turbo", fuelType: "Petrol", transmission: "Manual", isDefault: true },
      { name: "V Turbo AT", price: 1249000, engine: "1.0L Turbo", fuelType: "Petrol", transmission: "Automatic", isDefault: false },
      { name: "Z Turbo AT", price: 1379000, engine: "1.0L Turbo", fuelType: "Petrol", transmission: "Automatic", isDefault: false },
    ],
    faqs: [{ question: "Is a hybrid version available?", answer: "No, the Taisor is offered only in petrol and turbo-petrol powertrains; for a hybrid SUV, see the Urban Cruiser Hyryder." }],
  },
  {
    make: "Toyota", model: "Urban Cruiser Hyryder", trim: "", year: 2026, bodyType: "SUV", fuelType: "Hybrid",
    transmission: "CVT", price: 1115000, priceMax: 2020000, seating: 5, mileage: 27.97, safetyStars: 5,
    isFeatured: true, isBestSeller: true, isNewLaunch: false, availability: "In_Stock",
    description: "Toyota's self-charging strong hybrid SUV — exceptional fuel efficiency, AWD option, and confident road presence for both city and highway.",
    engineOptions: [
      { name: "1.5L Neo Drive Petrol", displacement: "1462cc", power: "103 bhp", torque: "137 Nm" },
      { name: "1.5L Strong Hybrid", displacement: "1490cc", power: "115 bhp (combined)", torque: "141 Nm" },
    ],
    safetyFeatures: ["6 Airbags", "360-degree Camera", "Toyota Safety Sense (ADAS)", "Electronic Stability Program", "All-Wheel Drive (select variants)"],
    infotainment: ["9-inch Touchscreen", "JBL Premium Sound System", "Wireless Android Auto & Apple CarPlay", "Head-Up Display"],
    exterior: ["Two-tone Roof Options", "LED Projector Headlamps", "18-inch Alloy Wheels"],
    interior: ["Ventilated Seats", "Panoramic Sunroof", "Wireless Charger"],
    colors: [{ name: "Enigma Black", hex: "#0A0A0A" }, { name: "Avalanche White", hex: "#F5F5F5" }, { name: "Sinister Blue", hex: "#1A2B4C" }],
    variants: [
      { name: "E Neo Drive", price: 1115000, engine: "1.5L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: false },
      { name: "S Hybrid", price: 1650000, engine: "1.5L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: true },
      { name: "G Hybrid AWD", price: 1895000, engine: "1.5L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: false },
      { name: "V Hybrid", price: 2020000, engine: "1.5L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: false },
    ],
    faqs: [
      { question: "How is the hybrid different from the petrol version?", answer: "The strong hybrid can run on electric power alone at low speeds and recovers energy under braking, giving close to 28 km/l — significantly better than the petrol-only Neo Drive variant." },
      { question: "Does the Hyryder need to be plugged in to charge?", answer: "No — it's a self-charging hybrid; the battery charges itself while driving and braking." },
    ],
  },
  {
    make: "Toyota", model: "Rumion", trim: "", year: 2026, bodyType: "MPV", fuelType: "Petrol",
    transmission: "Manual", price: 999000, priceMax: 1249000, seating: 7, mileage: 19.01, safetyStars: 4,
    isFeatured: false, isBestSeller: false, isNewLaunch: false, availability: "In_Stock",
    description: "A practical, spacious 7-seater MPV designed for growing families who need flexible seating and dependable running costs.",
    engineOptions: [{ name: "1.5L K-Series Petrol", displacement: "1462cc", power: "103 bhp", torque: "137 Nm" }],
    safetyFeatures: ["6 Airbags", "ABS with EBD", "ISOFIX Mounts", "Rear Parking Sensors with Camera"],
    infotainment: ["9-inch SmartPlay Pro touchscreen", "Wireless Android Auto & Apple CarPlay", "Steering-mounted Controls"],
    exterior: ["15-inch Alloy Wheels", "LED Headlamps", "Roof Rails"],
    interior: ["3-row Seating with Tumble-fold 3rd Row", "Rear AC Vents", "Multiple Storage Spaces"],
    colors: [{ name: "Brave Khaki", hex: "#8A7B5C" }, { name: "Silky Silver", hex: "#C9C9C9" }, { name: "Sizzling Red", hex: "#B0272D" }],
    variants: [
      { name: "S MT", price: 999000, engine: "1.5L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: true },
      { name: "G MT", price: 1129000, engine: "1.5L Petrol", fuelType: "Petrol", transmission: "Manual", isDefault: false },
      { name: "V AT", price: 1249000, engine: "1.5L Petrol", fuelType: "Petrol", transmission: "Automatic", isDefault: false },
    ],
    faqs: [{ question: "Is the third row usable for adults?", answer: "It's best suited for children or shorter trips with adults; for regular adult-friendly 3rd-row comfort, the Innova Crysta/Hycross is roomier." }],
  },
  {
    make: "Toyota", model: "Innova Crysta", trim: "", year: 2026, bodyType: "MPV", fuelType: "Diesel",
    transmission: "Manual", price: 2172000, priceMax: 2515000, seating: 7, mileage: 15.4, safetyStars: 4,
    isFeatured: true, isBestSeller: true, isNewLaunch: false, availability: "In_Stock",
    description: "India's most trusted MPV — legendary reliability, a plush cabin, and a diesel engine built for effortless long-distance comfort.",
    engineOptions: [
      { name: "2.4L Diesel", displacement: "2393cc", power: "148 bhp", torque: "343 Nm" },
      { name: "2.0L Petrol", displacement: "1998cc", power: "173 bhp", torque: "205 Nm" },
    ],
    safetyFeatures: ["7 Airbags", "ABS with EBD", "Vehicle Stability Control", "Hill Start Assist", "Rear Parking Camera"],
    infotainment: ["9-inch Touchscreen", "JBL Sound System", "Wireless Android Auto & Apple CarPlay"],
    exterior: ["17-inch Alloy Wheels", "LED Headlamps with DRLs", "Chrome Front Grille"],
    interior: ["Captain Seats (GX+ and above)", "Rear Roof-mounted AC", "Ambient Lighting"],
    colors: [{ name: "Super White", hex: "#FAFAFA" }, { name: "Grayish Blue", hex: "#4E5D6C" }, { name: "Attitude Black", hex: "#111111" }],
    variants: [
      { name: "GX", price: 2172000, engine: "2.4L Diesel", fuelType: "Diesel", transmission: "Manual", isDefault: true },
      { name: "VX", price: 2356000, engine: "2.4L Diesel", fuelType: "Diesel", transmission: "Manual", isDefault: false },
      { name: "ZX AT", price: 2515000, engine: "2.4L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: false },
    ],
    faqs: [{ question: "Crysta or Hycross — which should I choose?", answer: "Crysta uses a traditional body-on-frame diesel platform favored for durability and resale value; Hycross is a monocoque hybrid/petrol MPV with more modern features and a smoother ride." }],
  },
  {
    make: "Toyota", model: "Innova Hycross", trim: "", year: 2026, bodyType: "MPV", fuelType: "Hybrid",
    transmission: "CVT", price: 2000000, priceMax: 3140000, seating: 7, mileage: 23.24, safetyStars: 5,
    isFeatured: true, isBestSeller: true, isNewLaunch: false, availability: "In_Stock",
    description: "A completely reimagined Innova — monocoque construction, strong hybrid efficiency, and a premium cabin that rivals luxury MPVs.",
    engineOptions: [
      { name: "2.0L Petrol", displacement: "1987cc", power: "173 bhp", torque: "205 Nm" },
      { name: "2.0L Strong Hybrid", displacement: "1987cc", power: "184 bhp (combined)", torque: "188 Nm" },
    ],
    safetyFeatures: ["Toyota Safety Sense (ADAS)", "7 Airbags", "360-degree Camera", "Electronic Parking Brake with Auto Hold"],
    infotainment: ["10.1-inch Touchscreen", "JBL Premium Sound", "Wireless Android Auto & Apple CarPlay", "Digital Instrument Cluster"],
    exterior: ["18-inch Alloy Wheels", "LED Sequential Turn Signals", "Panoramic Sunroof"],
    interior: ["Ottoman Second-row Seats (ZX(O))", "Ambient Lighting", "Wireless Charging"],
    colors: [{ name: "Sentinel Bronze", hex: "#8C6239" }, { name: "Platinum White Pearl", hex: "#F7F7F7" }, { name: "Celestial Black", hex: "#0D0D0D" }],
    variants: [
      { name: "GX", price: 2000000, engine: "2.0L Petrol", fuelType: "Petrol", transmission: "CVT", isDefault: false },
      { name: "VX Hybrid", price: 2650000, engine: "2.0L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: true },
      { name: "ZX(O) Hybrid", price: 3140000, engine: "2.0L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: false },
    ],
    faqs: [{ question: "What mileage does the hybrid variant give?", answer: "Up to 23.24 km/l (ARAI-claimed) — nearly double a comparable diesel MPV." }],
  },
  {
    make: "Toyota", model: "Fortuner", trim: "", year: 2026, bodyType: "SUV", fuelType: "Diesel",
    transmission: "Automatic", price: 3393000, priceMax: 4383000, seating: 7, mileage: 12.75, safetyStars: 5,
    isFeatured: true, isBestSeller: true, isNewLaunch: false, availability: "Limited_Stock",
    description: "The benchmark full-size SUV — commanding presence, true 4x4 capability, and a powerful diesel engine for both city and off-road duty.",
    engineOptions: [
      { name: "2.8L Diesel", displacement: "2755cc", power: "204 bhp", torque: "500 Nm" },
      { name: "2.7L Petrol", displacement: "2694cc", power: "163 bhp", torque: "245 Nm" },
    ],
    safetyFeatures: ["7 Airbags", "Vehicle Stability Control", "Downhill Assist Control", "Hill-start Assist Control", "Disc Brakes on all wheels"],
    infotainment: ["9-inch Touchscreen", "JBL Premium Sound", "Wireless Android Auto & Apple CarPlay"],
    exterior: ["18-inch Alloy Wheels", "LED Headlamps & DRLs", "Skid Plates"],
    interior: ["Leather Upholstery", "Rear Entertainment (select variants)", "Third-row AC Vents"],
    colors: [{ name: "Avante Garde Bronze", hex: "#7A5C3E" }, { name: "White Pearl Crystal Shine", hex: "#F5F5F0" }, { name: "Attitude Black Mica", hex: "#101010" }],
    variants: [
      { name: "4x2 AT", price: 3393000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: true },
      { name: "4x4 AT", price: 4083000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: false },
      { name: "GR-S 4x4 AT", price: 4383000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: false },
    ],
    faqs: [{ question: "What's the difference between Fortuner and Fortuner Legender?", answer: "Legender gets a distinct front/rear design with a full-width LED light bar and a more road-focused suspension tune; mechanically both share the same engines." }],
  },
  {
    make: "Toyota", model: "Fortuner Legender", trim: "", year: 2026, bodyType: "SUV", fuelType: "Diesel",
    transmission: "Automatic", price: 4098000, priceMax: 5083000, seating: 7, mileage: 12.75, safetyStars: 5,
    isFeatured: false, isBestSeller: false, isNewLaunch: true, availability: "Limited_Stock",
    description: "The design-forward flagship of the Fortuner range — a distinctive front fascia, full-width LED light bar, and a more premium, road-biased character.",
    engineOptions: [{ name: "2.8L Diesel", displacement: "2755cc", power: "204 bhp", torque: "500 Nm" }],
    safetyFeatures: ["7 Airbags", "Vehicle Stability Control", "Panoramic View Monitor", "Disc Brakes on all wheels"],
    infotainment: ["9-inch Touchscreen", "JBL Premium Sound", "Digital Instrument Cluster"],
    exterior: ["20-inch Alloy Wheels", "Full-width LED Light Bar", "Sequential LED Turn Indicators"],
    interior: ["Ventilated Leather Seats", "Ambient Lighting", "Powered Tailgate"],
    colors: [{ name: "Precious Black", hex: "#0B0B0B" }, { name: "Frost White", hex: "#F8F8F8" }],
    variants: [
      { name: "4x2 AT", price: 4098000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: true },
      { name: "4x4 AT", price: 5083000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: false },
    ],
    faqs: [],
  },
  {
    make: "Toyota", model: "Hilux", trim: "", year: 2026, bodyType: "Pickup", fuelType: "Diesel",
    transmission: "Automatic", price: 3149000, priceMax: 3799000, seating: 5, mileage: 12.35, safetyStars: 5,
    isFeatured: false, isBestSeller: false, isNewLaunch: false, availability: "On_Request",
    description: "A rugged lifestyle pickup with genuine off-road pedigree, a powerful diesel engine, and a comfortable double-cab interior.",
    engineOptions: [{ name: "2.8L Diesel", displacement: "2755cc", power: "201 bhp", torque: "500 Nm" }],
    safetyFeatures: ["7 Airbags", "Vehicle Stability Control", "Trailer Sway Control", "Hill-start Assist Control"],
    infotainment: ["9-inch Touchscreen", "Wireless Android Auto & Apple CarPlay"],
    exterior: ["18-inch Alloy Wheels", "Sports Bar", "LED Headlamps"],
    interior: ["Leather Seats", "Dual-zone Climate Control"],
    colors: [{ name: "Oxide Bronze", hex: "#7D5A3C" }, { name: "Super White", hex: "#FAFAFA" }],
    variants: [
      { name: "4x4 MT High", price: 3149000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Manual", isDefault: false },
      { name: "4x4 AT High", price: 3799000, engine: "2.8L Diesel", fuelType: "Diesel", transmission: "Automatic", isDefault: true },
    ],
    faqs: [{ question: "Is the Hilux available for immediate delivery?", answer: "Hilux is typically available on request/indent basis — your sales representative can confirm the current lead time for your branch." }],
  },
  {
    make: "Toyota", model: "Camry", trim: "", year: 2026, bodyType: "Luxury", fuelType: "Hybrid",
    transmission: "CVT", price: 4863000, priceMax: 4863000, seating: 5, mileage: 25.49, safetyStars: 5,
    isFeatured: false, isBestSeller: false, isNewLaunch: false, availability: "On_Request",
    description: "A serene, self-charging hybrid executive sedan — effortless power delivery, whisper-quiet cabin, and understated luxury.",
    engineOptions: [{ name: "2.5L Strong Hybrid", displacement: "2487cc", power: "218 bhp (combined)", torque: "221 Nm" }],
    safetyFeatures: ["Toyota Safety Sense (ADAS)", "9 Airbags", "360-degree Camera", "Adaptive Cruise Control"],
    infotainment: ["9-inch Touchscreen", "JBL Premium Sound", "Wireless Charging", "Head-Up Display"],
    exterior: ["18-inch Alloy Wheels", "LED Headlamps", "Chrome Detailing"],
    interior: ["Ventilated & Heated Front Seats", "Power Rear Sunshade", "Ambient Lighting"],
    colors: [{ name: "Platinum White Pearl", hex: "#F7F7F7" }, { name: "Attitude Black", hex: "#101010" }, { name: "Graphite", hex: "#4B4B4B" }],
    variants: [{ name: "Hybrid", price: 4863000, engine: "2.5L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: true }],
    faqs: [],
  },
  {
    make: "Toyota", model: "Vellfire", trim: "", year: 2026, bodyType: "Luxury", fuelType: "Hybrid",
    transmission: "CVT", price: 12980000, priceMax: 12980000, seating: 7, mileage: 16.35, safetyStars: 5,
    isFeatured: false, isBestSeller: false, isNewLaunch: false, availability: "On_Request",
    description: "A first-class chauffeur-driven luxury MPV — lounge-style captain seats, hushed hybrid powertrain, and premium appointments throughout.",
    engineOptions: [{ name: "2.5L Strong Hybrid", displacement: "2487cc", power: "182 bhp (combined)", torque: "270 Nm" }],
    safetyFeatures: ["Toyota Safety Sense (ADAS)", "7 Airbags", "360-degree Camera", "Blind Spot Monitor"],
    infotainment: ["Dual Rear Entertainment Screens", "JBL Premium Sound", "Wireless Charging"],
    exterior: ["Signature Chrome Front Grille", "LED Headlamps", "Power Sliding Doors"],
    interior: ["VIP Lounge Captain Seats with Ottoman", "Retractable Rear Table", "Ambient Lighting"],
    colors: [{ name: "White Pearl Crystal Shine", hex: "#F5F5F0" }, { name: "Black", hex: "#0A0A0A" }],
    variants: [{ name: "Executive Lounge", price: 12980000, engine: "2.5L Hybrid", fuelType: "Hybrid", transmission: "CVT", isDefault: true }],
    faqs: [],
  },
];

async function main() {
  const conn = await getConnection();

  if (RESET) {
    console.log("Resetting existing catalog data...");
    for (const obj of ["Booking__c", "Vehicle_Variant__c", "Vehicle__c", "Sales_Rep__c", "Branch__c"]) {
      const existing = await conn.query(`SELECT Id FROM ${obj}`);
      if (existing.records.length) {
        await conn.sobject(obj).destroy(existing.records.map((r) => r.Id));
        console.log(`  Deleted ${existing.records.length} ${obj} records.`);
      }
    }
  }

  console.log("Creating branches...");
  const branchResults = await conn.sobject("Branch__c").create(BRANCHES);
  const branches = Array.isArray(branchResults) ? branchResults : [branchResults];
  const primaryBranchId = branches[0].id;
  console.log(`  Created ${branches.length} branches.`);

  console.log("Creating sales reps...");
  const repRecords = SALES_REPS.map((rep, i) => ({ ...rep, Branch__c: branches[i % branches.length].id }));
  const repResults = await conn.sobject("Sales_Rep__c").create(repRecords);
  console.log(`  Created ${(Array.isArray(repResults) ? repResults : [repResults]).length} sales reps.`);

  console.log("Creating vehicles + variants...");
  let vehicleCount = 0;
  let variantCount = 0;
  for (const v of VEHICLES) {
    const vin = `MBJ${v.model.replace(/\s+/g, "").toUpperCase().slice(0, 6)}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const vehicleResult = await conn.sobject("Vehicle__c").create({
      Make__c: v.make,
      Model__c: v.model,
      Trim__c: v.trim || null,
      Year__c: v.year,
      VIN__c: vin.slice(0, 32),
      Body_Type__c: v.bodyType,
      Fuel_Type__c: v.fuelType,
      Transmission__c: v.transmission,
      Price__c: v.price,
      Price_Max__c: v.priceMax,
      Odometer__c: 0,
      Status__c: "Available",
      Branch__c: primaryBranchId,
      Is_Featured__c: v.isFeatured,
      Is_Best_Seller__c: v.isBestSeller,
      Is_New_Launch__c: v.isNewLaunch,
      Availability_Status__c: v.availability,
      Seating_Capacity__c: v.seating,
      Mileage_Kmpl__c: v.mileage,
      Safety_Rating__c: v.safetyStars,
      Description__c: v.description,
      Engine_Options_Json__c: JSON.stringify(v.engineOptions),
      Safety_Features_Json__c: JSON.stringify(v.safetyFeatures),
      Infotainment_Features_Json__c: JSON.stringify(v.infotainment),
      Exterior_Highlights_Json__c: JSON.stringify(v.exterior),
      Interior_Highlights_Json__c: JSON.stringify(v.interior),
      Colors_Json__c: JSON.stringify(v.colors),
      Faqs_Json__c: JSON.stringify(v.faqs),
      Gallery_Urls__c: JSON.stringify([]),
      Accessories_Json__c: JSON.stringify([]),
      Spec_Sheet_Json__c: JSON.stringify({}),
    });
    if (!vehicleResult.success) {
      console.error(`Failed to create ${v.model}:`, vehicleResult.errors);
      continue;
    }
    vehicleCount++;

    const variantRecords = v.variants.map((variant, idx) => ({
      Name: variant.name,
      Vehicle__c: vehicleResult.id,
      Price__c: variant.price,
      Engine__c: variant.engine,
      Fuel_Type__c: variant.fuelType,
      Transmission__c: variant.transmission,
      Is_Default__c: variant.isDefault,
      Display_Order__c: idx + 1,
    }));
    const variantResults = await conn.sobject("Vehicle_Variant__c").create(variantRecords);
    variantCount += (Array.isArray(variantResults) ? variantResults : [variantResults]).length;
    console.log(`  ${v.model}: created with ${variantRecords.length} variants.`);
  }

  console.log(`\nDone. Created ${vehicleCount} vehicles and ${variantCount} variants across ${branches.length} branches.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
