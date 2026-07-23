import { Car, Truck } from "lucide-react";
import type { BodyType } from "@tdm/types";
import { cn } from "@/lib/utils";

const GRADIENTS: Record<BodyType, string> = {
  Sedan: "from-slate-700 to-slate-900",
  SUV: "from-emerald-700 to-emerald-950",
  Hatchback: "from-sky-600 to-sky-900",
  Coupe: "from-purple-700 to-purple-950",
  Convertible: "from-amber-600 to-amber-900",
  Truck: "from-orange-700 to-orange-950",
  Van: "from-teal-700 to-teal-950",
  Wagon: "from-cyan-700 to-cyan-950",
  MPV: "from-indigo-700 to-indigo-950",
  Pickup: "from-stone-700 to-stone-950",
  Luxury: "from-zinc-800 to-black",
};

export function PlaceholderVehicleImage({
  bodyType,
  label,
  className,
}: {
  bodyType: BodyType;
  label: string;
  className?: string;
}) {
  const Icon = bodyType === "Pickup" || bodyType === "Truck" ? Truck : Car;
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br",
        GRADIENTS[bodyType] ?? "from-slate-700 to-slate-900",
        className,
      )}
    >
      <Icon className="h-16 w-16 text-white/20" strokeWidth={1} />
      <span className="absolute bottom-3 left-3 right-3 text-sm font-medium text-white/90">{label}</span>
    </div>
  );
}
