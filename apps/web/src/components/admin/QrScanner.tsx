import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BarcodeDetectorResult {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

interface QrScannerProps {
  onDetect: (value: string) => void;
}

/**
 * Real QR check-in scanning: uses the native BarcodeDetector API (Chrome/Edge) to read
 * a QR code live from the camera. Falls back to manual entry everywhere else — the same
 * fallback also covers USB/Bluetooth handheld scanners, which behave as keyboard input.
 */
export function QrScanner({ onDetect }: QrScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [manualCode, setManualCode] = React.useState("");
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const supported = typeof window !== "undefined" && !!window.BarcodeDetector;

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      // The <video> is only mounted once `scanning` is true, so the stream is attached in the effect below.
      setScanning(true);
    } catch {
      setCameraError("Couldn't access the camera. Enter the code manually below.");
    }
  };

  React.useEffect(() => {
    if (!scanning || !supported) return;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
    let cancelled = false;

    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {
        if (cancelled) return;
        stopCamera();
        setCameraError("Couldn't start the camera preview. Enter the code manually below.");
      });
    }

    const tick = async () => {
      if (cancelled || !videoRef.current) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (results[0]?.rawValue) {
          onDetect(results[0].rawValue);
          stopCamera();
          return;
        }
      } catch {
        // Transient detection errors are expected between frames — ignore and keep polling.
      }
      if (!cancelled) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return () => {
      cancelled = true;
    };
  }, [scanning, supported, onDetect, stopCamera]);

  React.useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="space-y-3">
      {supported && (
        <div className="space-y-2">
          {scanning ? (
            <div className="space-y-2">
              <video ref={videoRef} className="w-full rounded-md border" muted playsInline />
              <Button size="sm" variant="outline" onClick={stopCamera}>Stop Camera</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={startCamera}>Scan with Camera</Button>
          )}
          {cameraError && <p className="text-xs text-destructive">{cameraError}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Or enter/scan check-in code"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manualCode.trim()) {
              onDetect(manualCode.trim());
              setManualCode("");
            }
          }}
        />
        <Button
          size="sm"
          disabled={!manualCode.trim()}
          onClick={() => {
            onDetect(manualCode.trim());
            setManualCode("");
          }}
        >
          Check In
        </Button>
      </div>
    </div>
  );
}
