import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

/** Prompts the user to reload when a new build has been precached in the background — see vite.config.ts registerType: "prompt". */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg">
      <span>A new version is available.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>Reload</Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Dismiss</Button>
    </div>
  );
}
