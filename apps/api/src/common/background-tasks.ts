/**
 * Work deliberately left running after a response is sent (e.g. an onboarding metadata deploy).
 * A long-running server finishes it on its own; a serverless runtime may freeze the instance once
 * the response is out, so its entry point registers a host hook that keeps the invocation alive
 * until the promise settles. Callers stay runtime-agnostic and still handle their own errors.
 */
type BackgroundTaskHost = (task: Promise<unknown>) => void;

let host: BackgroundTaskHost | undefined;

export function setBackgroundTaskHost(next: BackgroundTaskHost): void {
  host = next;
}

export function runInBackground<T>(task: Promise<T>): Promise<T> {
  host?.(task.catch(() => undefined));
  return task;
}
