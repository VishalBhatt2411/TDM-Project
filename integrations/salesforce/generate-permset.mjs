import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const objectsDir = join(process.cwd(), "mdapi", "objects");
const files = readdirSync(objectsDir).filter((f) => f.endsWith(".object"));

const CUSTOM_OBJECTS = [
  "Branch__c",
  "Vehicle__c",
  "Sales_Rep__c",
  "Booking__c",
  "Compliance_Record__c",
  "Drive_Feedback__c",
  "Wishlist_Item__c",
  "Vehicle_Allocation__c",
  "Vehicle_Variant__c",
];

let objectPermXml = "";
let fieldPermXml = "";

for (const file of files) {
  const objectName = file.replace(".object", "");
  const content = readFileSync(join(objectsDir, file), "utf8");
  const fieldBlocks = [...content.matchAll(/<fields>([\s\S]*?)<\/fields>/g)].map((m) => m[1]);

  for (const block of fieldBlocks) {
    const nameMatch = block.match(/<fullName>([^<]+)<\/fullName>/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const isRequired = /<required>true<\/required>/.test(block);
    // Salesforce forbids explicit FieldPermissions on required fields — they're implicitly always accessible.
    if (isRequired) continue;
    fieldPermXml += `    <fieldPermissions>\n        <field>${objectName}.${fieldName}</field>\n        <readable>true</readable>\n        <editable>true</editable>\n    </fieldPermissions>\n`;
  }

  if (CUSTOM_OBJECTS.includes(objectName)) {
    objectPermXml += `    <objectPermissions>\n        <object>${objectName}</object>\n        <allowCreate>true</allowCreate>\n        <allowDelete>true</allowDelete>\n        <allowEdit>true</allowEdit>\n        <allowRead>true</allowRead>\n        <modifyAllRecords>true</modifyAllRecords>\n        <viewAllRecords>true</viewAllRecords>\n    </objectPermissions>\n`;
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>TDM Full Access</label>
    <description>Grants full CRUD + field-level access to all TDM custom objects/fields for backend integration users.</description>
    <hasActivationRequired>false</hasActivationRequired>
${objectPermXml}${fieldPermXml}</PermissionSet>
`;

mkdirSync(join(process.cwd(), "mdapi", "permissionsets"), { recursive: true });
writeFileSync(join(process.cwd(), "mdapi", "permissionsets", "TDM_Full_Access.permissionset"), xml);
console.log("Generated TDM_Full_Access.permissionset with", fieldMatchesCountLog());

function fieldMatchesCountLog() {
  return `${(fieldPermXml.match(/<fieldPermissions>/g) || []).length} field permissions and ${(objectPermXml.match(/<objectPermissions>/g) || []).length} object permissions`;
}
