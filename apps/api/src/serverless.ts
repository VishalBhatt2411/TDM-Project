import "reflect-metadata";
// Must stay the first app import: validates the environment before any module reads it.
import { env } from "./common/env";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";
import { setBackgroundTaskHost } from "./common/background-tasks";

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

let listener: Promise<RequestListener> | undefined;

/** Boots the app once per warm instance; later invocations reuse it. A failed boot is retried on the next request. */
function app(): Promise<RequestListener> {
  listener ??= (async () => {
    const nest = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
    configureApp(nest);
    await nest.init();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "api_serverless_ready", schedulerMode: env.schedulerMode }));
    return nest.getHttpAdapter().getInstance() as RequestListener;
  })().catch((err) => {
    listener = undefined;
    throw err;
  });
  return listener;
}

/**
 * Request handler for a serverless Node runtime. `keepAlive` is the platform's hook for work that
 * outlives the response (Vercel's waitUntil) — passed in by the platform entry so this package never
 * depends on a hosting SDK.
 */
export function createHandler(keepAlive?: (task: Promise<unknown>) => void) {
  if (keepAlive) setBackgroundTaskHost(keepAlive);
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    (await app())(req, res);
  };
}
