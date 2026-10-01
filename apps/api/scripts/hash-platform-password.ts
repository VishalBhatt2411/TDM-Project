/**
 * Prints the PLATFORM_OPERATOR_PASSWORD_HASH for a password read from stdin (never an argument,
 * so it stays out of shell history and process listings).
 * Usage: printf %s "<password>" | npm run -s platform:hash-password -w apps/api
 */
import { hashSecret } from "@tdm/postgres-adapter";

const MIN_PASSWORD_LENGTH = 16;

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    process.stderr.write(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
    process.exit(1);
  }
  process.stdout.write(`${await hashSecret(password)}\n`);
}

void main();
