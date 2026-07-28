/**
 * One-time seed for the very first Admin Console user. Staff users are normally
 * only creatable by an existing Admin (see AdminUsersService) — this script exists
 * solely to break that chicken-and-egg problem for the first account. No password
 * is set here — staff authenticate with their existing Salesforce account (OAuth2),
 * so this email must match a real Salesforce User's identity email.
 *
 * Usage: node seed-first-admin.mjs <email> <name>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , email, ...nameParts] = process.argv;
  if (!email) {
    console.error("Usage: node seed-first-admin.mjs <email> <name>");
    process.exit(1);
  }
  const name = nameParts.join(" ") || email.split("@")[0];

  const existing = await prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Staff user already exists: ${existing.email} (role=${existing.role}, id=${existing.id})`);
    await prisma.$disconnect();
    return;
  }

  const created = await prisma.staffUser.create({
    data: { email: email.toLowerCase(), name, role: "Admin", permissions: [] },
  });
  console.log(`Created first Admin staff user: ${created.email} (id=${created.id})`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
