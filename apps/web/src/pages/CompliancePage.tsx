import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { getBooking } from "@/api/bookings";
import { getVehicle } from "@/api/vehicles";
import { getComplianceStatus, submitCompliance } from "@/api/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CompliancePage() {
  const { id } = useParams<{ id: string }>();
  const bookingId = id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signaturePadRef = React.useRef<SignaturePadHandle>(null);

  const { data: booking } = useQuery({ queryKey: ["booking", bookingId], queryFn: () => getBooking(bookingId) });
  const { data: vehicle } = useQuery({
    queryKey: ["vehicle", booking?.vehicleId],
    queryFn: () => getVehicle(booking!.vehicleId),
    enabled: !!booking,
  });
  const { data: status } = useQuery({ queryKey: ["compliance", bookingId], queryFn: () => getComplianceStatus(bookingId) });

  const [licenseNumber, setLicenseNumber] = React.useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = React.useState("");
  const [licenseFile, setLicenseFile] = React.useState<File | null>(null);
  const [consentAccepted, setConsentAccepted] = React.useState(false);
  const [hasSignature, setHasSignature] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!licenseFile) throw new Error("Please upload a photo of your driving license.");
      if (!ALLOWED_IMAGE_TYPES.has(licenseFile.type)) throw new Error("License photo must be a JPEG, PNG, or WebP image.");
      const signatureBase64 = signaturePadRef.current?.toBase64();
      if (!signatureBase64) throw new Error("Please draw your signature.");
      if (!consentAccepted) throw new Error("Please accept the consent terms to continue.");

      const licenseImageBase64 = await fileToBase64(licenseFile);
      return submitCompliance(bookingId, {
        licenseNumber,
        licenseImageBase64,
        licenseImageContentType: licenseFile.type,
        licenseExpiryDate: licenseExpiryDate || undefined,
        consentAccepted,
        signatureImageBase64: signatureBase64,
        signatureImageContentType: "image/png",
      });
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["compliance", bookingId] });
    },
    onError: (err: Error) => setError(err.message || "Something went wrong. Please try again."),
  });

  if (submitMutation.isSuccess || status?.signedAt) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" />
        <h1 className="text-2xl font-semibold tracking-tight">You're all set</h1>
        <p className="mt-2 text-muted-foreground">
          Your pre-drive details have been submitted. A staff member will verify your license when you arrive.
        </p>
        <Link to="/my-bookings">
          <Button className="mt-6">Back to My Test Drives</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Pre-Drive Check-In</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {vehicle ? `${vehicle.make} ${vehicle.model}` : "Your test drive"}
        {booking ? ` · ${new Date(booking.slot.start).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Driving License</CardTitle>
          <CardDescription>A staff member will verify this against the physical license at check-in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="license-number">License Number</Label>
            <Input id="license-number" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="license-expiry">Expiry Date (optional)</Label>
            <Input
              id="license-expiry"
              type="date"
              value={licenseExpiryDate}
              onChange={(e) => setLicenseExpiryDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="license-photo">License Photo</Label>
            <Input
              id="license-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Signature</CardTitle>
          <CardDescription>By signing, you agree to the dealership's test drive terms and conditions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignaturePad ref={signaturePadRef} onChange={setHasSignature} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
            />
            <span>
              I confirm the information above is accurate and I consent to the dealership's test drive terms, including
              liability for damages during the drive.
            </span>
          </label>
        </CardContent>
      </Card>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex gap-3">
        <Button
          disabled={submitMutation.isPending || !licenseNumber || !licenseFile || !hasSignature || !consentAccepted}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? "Submitting…" : "Submit"}
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>
    </div>
  );
}
