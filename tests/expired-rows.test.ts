import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ExpiredRowsRepository } from "../integrations/postgres/src/repositories/expired-rows.repository";

const ROUTINE_MODELS = ["otpCode", "refreshToken", "magicLoginToken", "customerPasswordToken", "staffRefreshToken", "staffOAuthState", "reminderLog", "followUpLog"];

function fakePrisma(options: { organizationFails?: boolean } = {}) {
  const calls: { model: string; where: Record<string, unknown> }[] = [];
  const delegate = (model: string, fails = false) => ({
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      calls.push({ model, where });
      if (fails) throw new Error("cascade timed out");
      return { count: 2 };
    },
  });
  const prisma: Record<string, unknown> = { organization: delegate("organization", options.organizationFails) };
  for (const model of ROUTINE_MODELS) prisma[model] = delegate(model);
  return { prisma: prisma as unknown as PrismaClient, calls };
}

test("the organization purge runs after the routine purges and reports every count", async () => {
  const { prisma, calls } = fakePrisma();
  const result = await new ExpiredRowsRepository(prisma).purge();

  assert.equal(calls.at(-1)?.model, "organization");
  assert.equal(calls.length, ROUTINE_MODELS.length + 1);
  assert.equal(result.unverifiedOrganizations, 2);
  assert.equal(result.otpCodes, 2);
});

test("only a sign-up that never verified and never connected is purged", async () => {
  const { prisma, calls } = fakePrisma();
  await new ExpiredRowsRepository(prisma).purge(new Date("2026-10-15T00:00:00Z"));

  assert.deepEqual(calls.find((call) => call.model === "organization")?.where, {
    emailVerifiedAt: null,
    sfRefreshTokenEnc: null,
    connectionStatus: { not: "connected" },
    createdAt: { lt: new Date("2026-10-08T00:00:00Z") },
  });
});

test("a failing organization purge cannot leave the routine purges unrun", async () => {
  const { prisma, calls } = fakePrisma({ organizationFails: true });

  await assert.rejects(new ExpiredRowsRepository(prisma).purge(), /cascade timed out/);
  assert.equal(calls.filter((call) => call.model !== "organization").length, ROUTINE_MODELS.length);
});
