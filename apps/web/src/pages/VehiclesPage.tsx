import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VehicleCard } from "@/components/VehicleCard";
import { searchVehicles } from "@/api/vehicles";
import type { BodyType } from "@tdm/types";

const BODY_TYPES: BodyType[] = ["Sedan", "SUV", "Hatchback", "MPV", "Luxury", "Pickup"];

export function VehiclesPage() {
  const [bodyType, setBodyType] = React.useState<BodyType | undefined>(undefined);
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicles", bodyType, debouncedQ],
    queryFn: () => searchVehicles({ bodyType, q: debouncedQ || undefined }),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Explore the Toyota Lineup</h1>
        <p className="text-sm text-muted-foreground">Find the right vehicle and book a test drive in minutes.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={bodyType === undefined ? "default" : "outline"} size="sm" onClick={() => setBodyType(undefined)}>
            All
          </Button>
          {BODY_TYPES.map((type) => (
            <Button key={type} variant={bodyType === type ? "default" : "outline"} size="sm" onClick={() => setBodyType(type)}>
              {type}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {isError && <p className="text-destructive">Couldn't load vehicles. Is the API running?</p>}
      {data && data.items.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No vehicles match this filter yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((vehicle, i) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} index={i} />
        ))}
      </div>
    </div>
  );
}
