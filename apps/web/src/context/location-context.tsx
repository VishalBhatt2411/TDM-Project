import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { listBranches, type BranchDto } from "@/api/branches";

/** Where the customer is shopping. Empty means every city; a city without a branch means every branch in it. */
export interface ShoppingLocation {
  city?: string;
  branchId?: string;
}

const STORAGE_KEY = "tdm_shopping_location";

// A per-viewer convenience only — storage can be blocked or cleared, so every access is guarded
// and a missing value simply means "not chosen yet".
function readStoredLocation(): ShoppingLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { city, branchId } = parsed as Record<string, unknown>;
    return {
      city: typeof city === "string" ? city : undefined,
      branchId: typeof branchId === "string" ? branchId : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredLocation(location: ShoppingLocation): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // Storage unavailable — the choice still applies for this visit.
  }
}

/** Drops a stored city/branch that no longer exists on this host (renamed, deactivated, other dealership). */
function resolveLocation(stored: ShoppingLocation | null, branches: BranchDto[]): ShoppingLocation {
  if (!stored?.city) return {};
  const cityBranches = branches.filter((b) => b.address.city === stored.city);
  if (cityBranches.length === 0) return {};
  const branchId = cityBranches.some((b) => b.id === stored.branchId) ? stored.branchId : undefined;
  return { city: stored.city, branchId };
}

interface LocationContextValue {
  location: ShoppingLocation;
  /** False until the customer has picked (or dismissed) a location on this device. */
  hasChosen: boolean;
  /** True once branches have loaded (or failed) — queries that depend on the location wait for this. */
  isReady: boolean;
  branches: BranchDto[];
  cities: string[];
  setLocation: (location: ShoppingLocation) => void;
}

const LocationContext = React.createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { data, isSuccess, isError } = useQuery({ queryKey: ["branches"], queryFn: listBranches, staleTime: 5 * 60_000 });
  const [stored, setStored] = React.useState<ShoppingLocation | null>(readStoredLocation);

  const value = React.useMemo<LocationContextValue>(() => {
    const branches = data ?? [];
    const cities = [...new Set(branches.map((b) => b.address.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      location: resolveLocation(stored, branches),
      hasChosen: stored !== null,
      isReady: isSuccess || isError,
      branches,
      cities,
      setLocation: (location) => {
        writeStoredLocation(location);
        setStored(location);
      },
    };
  }, [data, isSuccess, isError, stored]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useShoppingLocation(): LocationContextValue {
  const context = React.useContext(LocationContext);
  if (!context) throw new Error("useShoppingLocation must be used within a LocationProvider");
  return context;
}
