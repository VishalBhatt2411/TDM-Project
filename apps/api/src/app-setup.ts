import { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { env } from "./common/env";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { TenantResolverService } from "./tenancy/tenant-resolver.service";
import { siteOriginOf } from "./tenancy/tenant-site-origin";

const DEFAULT_BODY_LIMIT = "1mb";
// Two base64 images at SubmitComplianceDto's 8,000,000-char cap each, plus JSON overhead.
const COMPLIANCE_BODY_LIMIT = "17mb";
// One base64 image at MAX_BRAND_IMAGE_BYTES.hero (3 MB decoded = 4 MB encoded), plus JSON overhead.
const BRAND_IMAGE_BODY_LIMIT = "4.5mb";

/** Middleware, security, validation and docs — identical for the long-running server and the serverless entry. */
export function configureApp(app: NestExpressApplication): void {
  // Behind a load balancer every request otherwise appears to come from the proxy's IP,
  // collapsing all clients into one rate-limit bucket (see ThrottlerModule).
  if (env.trustProxyHops > 0) app.set("trust proxy", env.trustProxyHops);

  // Body limits: only the compliance upload (base64 license photo + signature, each capped
  // by SubmitComplianceDto) and a brand image upload need a large body; everything else keeps a tight limit so an
  // oversized payload can't tie up memory on any other route.
  app.use(/^\/api\/v1\/bookings\/[^/]+\/compliance$/, json({ limit: COMPLIANCE_BODY_LIMIT }));
  app.use(/^\/api\/v1\/admin\/branding\/images$/, json({ limit: BRAND_IMAGE_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));

  app.use(helmet());
  // The web app calls the API same-origin through /api, so CORS only matters when a deployment
  // serves them apart: the platform origins, plus any registered tenant host (subdomain or
  // custom domain) on the shared scheme and port.
  const tenantHosts = app.get(TenantResolverService);
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      let hostname: string;
      try {
        hostname = new URL(origin).hostname;
      } catch {
        return callback(null, false);
      }
      if (siteOriginOf(hostname) !== origin) return callback(null, false);
      tenantHosts.resolveHost(hostname).then(
        (route) => callback(null, !!route),
        () => callback(null, false),
      );
    },
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
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
}
