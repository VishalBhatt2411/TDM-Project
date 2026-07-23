import * as React from "react";
import { RotateCw } from "lucide-react";

/**
 * A genuinely interactive 360°-style viewer: drag (or use arrow keys) to cycle
 * through the vehicle's available angle photos. This is an honest implementation
 * given what's available — a true continuous-rotation turntable set would need
 * dozens of frames from a real photo shoot, which isn't something we can source
 * from stock photography. With only a handful of angles, we snap between them
 * rather than pretend to interpolate a smooth spin.
 */
export function Vehicle360Viewer({ images, label }: { images: string[]; label: string }) {
  const [frameIndex, setFrameIndex] = React.useState(0);
  const dragState = React.useRef<{ startX: number; startIndex: number } | null>(null);

  const frameCount = images.length;
  const goTo = (index: number) => setFrameIndex(((index % frameCount) + frameCount) % frameCount);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startIndex: frameIndex };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const deltaX = e.clientX - dragState.current.startX;
    const framesPerDrag = Math.round(deltaX / 60);
    goTo(dragState.current.startIndex - framesPerDrag);
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goTo(frameIndex - 1);
    if (e.key === "ArrowRight") goTo(frameIndex + 1);
  };

  if (frameCount === 0) return null;

  return (
    <div className="relative">
      <div
        role="slider"
        tabIndex={0}
        aria-label={`360 degree view of ${label}`}
        aria-valuenow={frameIndex}
        aria-valuemin={0}
        aria-valuemax={frameCount - 1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative aspect-[16/9] w-full cursor-grab select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
      >
        {images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`${label} — angle ${i + 1} of ${frameCount}`}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-100"
            style={{ opacity: i === frameIndex ? 1 : 0 }}
          />
        ))}
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
          <RotateCw className="h-3.5 w-3.5" />
          Drag to rotate · {frameIndex + 1}/{frameCount}
        </div>
      </div>
    </div>
  );
}
