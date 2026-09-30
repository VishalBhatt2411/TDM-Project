import * as React from "react";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { getCheckInToken } from "@/api/bookings";
import { useRegional } from "@/hooks/use-regional";
import { errorMessage } from "@/lib/api-error";

interface QrCheckInCodeProps {
  bookingId: string;
  /** The booking's branch zone — the expiry reads on the showroom's clock. */
  timeZone?: string;
}

/** Renders the customer's signed check-in token as a scannable QR code — staff scans (or types) it at check-in. */
export function QrCheckInCode({ bookingId, timeZone }: QrCheckInCodeProps) {
  const regional = useRegional();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["check-in-token", bookingId],
    queryFn: () => getCheckInToken(bookingId),
    // A refusal (outside the check-in window) won't change on retry.
    retry: false,
  });
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(data.token, { width: 240, margin: 1 }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [data]);

  if (isLoading) return <div className="mx-auto h-60 w-60 animate-pulse rounded-md bg-muted" />;
  if (isError || !data) {
    return <p className="text-center text-sm text-destructive">{errorMessage(error) ?? "Couldn't generate a check-in code. Please try again."}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {dataUrl ? (
        <img src={dataUrl} alt="Booking check-in QR code" className="h-60 w-60 rounded-md border" />
      ) : (
        <div className="h-60 w-60 animate-pulse rounded-md bg-muted" />
      )}
      <p className="text-xs text-muted-foreground">
        Show this to a staff member at check-in. Valid until {regional.dateTime(data.expiresAt, timeZone)}.
      </p>
    </div>
  );
}
