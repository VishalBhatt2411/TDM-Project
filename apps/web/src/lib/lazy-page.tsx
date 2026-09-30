import * as React from "react";

const RELOAD_MARK = "tdm:chunk-reload";

/**
 * After a deploy the previous build's chunks are gone, so a tab opened before it fails to load the
 * next route. Reload once to pick up the new build; the session mark stops a reload loop when the
 * chunk is genuinely unreachable (offline), in which case the error surfaces normally.
 */
async function importWithReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    const module = await load();
    try {
      sessionStorage.removeItem(RELOAD_MARK);
    } catch {
      // Storage unavailable (private mode) — nothing to clear.
    }
    return module;
  } catch (error) {
    let alreadyReloaded = true;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_MARK) === "1";
      if (!alreadyReloaded) sessionStorage.setItem(RELOAD_MARK, "1");
    } catch {
      // Without storage we can't guard against a loop, so don't reload.
    }
    if (!alreadyReloaded) {
      window.location.reload();
      return new Promise<T>(() => undefined);
    }
    throw error;
  }
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8">
      <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

/** A route component loaded on first visit, keeping the admin console and rarely used pages out of the entry bundle. */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, exportName: K) {
  const Page = React.lazy(() =>
    importWithReload(load).then((module) => ({ default: module[exportName] as React.ComponentType })),
  );
  return function LazyPage() {
    return (
      <React.Suspense fallback={<PageSkeleton />}>
        <Page />
      </React.Suspense>
    );
  };
}
