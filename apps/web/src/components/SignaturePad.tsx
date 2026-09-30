import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SignaturePadHandle {
  /** Returns the drawn signature as a base64 PNG (no data: prefix), or null if nothing was drawn. */
  toBase64: () => string | null;
  clear: () => void;
}

interface SignaturePadProps {
  className?: string;
  onChange?: (hasStrokes: boolean) => void;
}

function pointerPosition(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

/** In-house signature capture — customer draws on a canvas, exported as a PNG stored against the booking. See FR-54/55. */
export const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(({ className, onChange }, ref) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingRef = React.useRef(false);
  const [hasStrokes, setHasStrokes] = React.useState(false);

  const getContext = () => canvasRef.current?.getContext("2d") ?? null;

  const clear = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange?.(false);
  }, [onChange]);

  React.useImperativeHandle(ref, () => ({
    clear,
    toBase64: () => {
      const canvas = canvasRef.current;
      if (!canvas || !hasStrokes) return null;
      return canvas.toDataURL("image/png").split(",")[1] ?? null;
    },
  }));

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = pointerPosition(canvas, event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    const { x, y } = pointerPosition(canvas, event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasStrokes) {
      setHasStrokes(true);
      onChange?.(true);
    }
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full touch-none rounded-md border border-input bg-white"
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Sign above using your mouse, stylus, or finger.</p>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
});
SignaturePad.displayName = "SignaturePad";
