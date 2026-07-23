import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Test Drive Management Platform API")
    .setDescription("Registration, vehicle discovery, and test drive booking — vertical slice v1")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`TDM API listening on http://localhost:${port}/api/v1 (docs at /api/docs)`);
}

bootstrap();
