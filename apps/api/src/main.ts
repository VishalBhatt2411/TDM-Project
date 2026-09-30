import "reflect-metadata";
// Must stay the first app import: validates the environment before any module reads it.
import { env } from "./common/env";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";

// Node kills the whole process on an unhandled promise rejection by default — in a multi-tenant
// server, one background task's uncaught error (e.g. a fire-and-forget metadata deploy) would
// otherwise take down every tenant's traffic. Log and keep running instead of crashing; call
// sites should still attribute and record errors properly (see onboarding.service.ts) — this is
// only the last-resort net for whatever still slips past that.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: "unhandled_rejection", reason: reason instanceof Error ? reason.message : String(reason) }));
});

const DEFAULT_BODY_LIMIT = "1mb";
// Two base64 images at SubmitComplianceDto's 8,000,000-char cap each, plus JSON overhead.
const COMPLIANCE_BODY_LIMIT = "17mb";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Behind a load balancer every request otherwise appears to come from the proxy's IP,
  // collapsing all clients into one rate-limit bucket (see ThrottlerModule).
  if (env.trustProxyHops > 0) app.set("trust proxy", env.trustProxyHops);

  // Body limits: only the compliance upload (base64 license photo + signature, each capped
  // by SubmitComplianceDto) needs a large body; everything else keeps a tight limit so an
  // oversized payload can't tie up memory on any other route.
  app.use(/^\/api\/v1\/bookings\/[^/]+\/compliance$/, json({ limit: COMPLIANCE_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));

  app.use(helmet());
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  if (env.enableApiDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Test Drive Management Platform API")
      .setDescription("Registration, vehicle discovery, and test drive booking — vertical slice v1")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  await app.listen(env.port);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "api_listening", port: env.port, apiDocs: env.enableApiDocs }));
}

bootstrap();
