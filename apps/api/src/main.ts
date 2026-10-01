import "reflect-metadata";
// Must stay the first app import: validates the environment before any module reads it.
import { env } from "./common/env";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";

// Node kills the whole process on an unhandled promise rejection by default — in a multi-tenant
// server, one background task's uncaught error (e.g. a fire-and-forget metadata deploy) would
// otherwise take down every tenant's traffic. Log and keep running instead of crashing; call
// sites should still attribute and record errors properly (see onboarding.service.ts) — this is
// only the last-resort net for whatever still slips past that.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: "unhandled_rejection", reason: reason instanceof Error ? reason.message : String(reason) }));
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);

  await app.listen(env.port);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "api_listening", port: env.port, apiDocs: env.enableApiDocs }));
}

bootstrap();
