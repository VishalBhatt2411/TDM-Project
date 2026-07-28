import * as React from "react";
import { Check } from "lucide-react";
import type { VehicleColor } from "@tdm/types";
import { cn } from "@/lib/utils";

/**
 * Interactive colour picker: selecting a swatch previews a photo in that
 * colour. Real per-colour photography (`color.imageUrl`) is preferred; when a
 * colour has none we fall back to cycling the vehicle's own gallery photos so
 * the picker still feels alive rather than showing a single static swatch.
 */
export function ColorSelector({
  colors,
  galleryUrls,
  label,
}: {
  colors: VehicleColor[];
  galleryUrls: string[];
  label: string;
}) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  if (colors.length === 0) return null;

  const selected = colors[selectedIndex];
  const previewUrl = selected.imageUrl ?? (galleryUrls.length > 0 ? galleryUrls[selectedIndex % galleryUrls.length] : undefined);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Available Colors</h2>
      <div className="flex flex-wrap gap-3">
        {colors.map((color, i) => {
          const isSelected = i === selectedIndex;
          return (
            <button
              key={color.name}
              type="button"
              onClick={() => setSelectedIndex(i)}
              aria-pressed={isSelected}
              aria-label={`Select ${color.name}`}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-sm transition-transform",
                  isSelected ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border group-hover:scale-105",
                )}
                style={{ backgroundColor: color.hex }}
              >
                {isSelected && <Check className="h-5 w-5 text-white drop-shadow" strokeWidth={3} />}
              </span>
              <span className={cn("text-xs", isSelected ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {color.name}
              </span>
            </button>
          );
        })}
      </div>

      {previewUrl && (
        <div className="mt-4 max-w-sm overflow-hidden rounded-lg border bg-muted">
          <img
            key={previewUrl}
            src={previewUrl}
            alt={`${label} in ${selected.name}`}
            className="aspect-[16/10] w-full object-cover"
          />
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {label} shown in <span className="font-medium text-foreground">{selected.name}</span>
            {!selected.imageUrl && " — illustrative preview"}
          </p>
        </div>
      )}
    </div>
  );
}
