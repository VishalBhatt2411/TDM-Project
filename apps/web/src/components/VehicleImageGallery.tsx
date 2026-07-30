import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlaceholderVehicleImage } from "@/components/PlaceholderVehicleImage";
import type { BodyType } from "@tdm/types";
import { cn } from "@/lib/utils";

/**
 * Standard photo gallery: one large image with Previous/Next controls and a
 * thumbnail strip. All images are centre-cropped to a fixed aspect ratio so a
 * mix of portrait and landscape source photos still reads as one clean grid.
 */
export function VehicleImageGallery({
  images,
  label,
  bodyType,
}: {
  images: string[];
  label: string;
  bodyType: BodyType;
}) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const count = images.length;

  const goTo = React.useCallback((index: number) => setActiveIndex(((index % count) + count) % count), [count]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goTo(activeIndex - 1);
    if (e.key === "ArrowRight") goTo(activeIndex + 1);
  };

  if (count === 0) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
        <PlaceholderVehicleImage bodyType={bodyType} label={label} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        role="group"
        tabIndex={0}
        aria-label={`Photo gallery for ${label}`}
        onKeyDown={onKeyDown}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted"
      >
        <img
          key={images[activeIndex]}
          src={images[activeIndex]}
          alt={`${label} — photo ${activeIndex + 1} of ${count}`}
          className="h-full w-full object-cover"
        />

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              {activeIndex + 1} / {count}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === activeIndex}
              onClick={() => goTo(i)}
              className={cn(
                "aspect-square overflow-hidden rounded-md border-2 transition-colors",
                i === activeIndex ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
