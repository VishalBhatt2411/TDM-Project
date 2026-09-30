import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmLicense, getAdminComplianceStatus, verifyLicenseAi } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LicenseAiAssessment } from "@tdm/types";

const FLAG_LABELS: Record<string, string> = {
  blurry: "Photo is blurry",
  expired: "License appears expired",
  name_mismatch: "Name doesn't match booking",
  number_mismatch: "License number doesn't match",
  unreadable: "Photo is unreadable",
  not_a_license: "Doesn't look like a license",
  ai_parse_error: "AI response couldn't be read",
};

interface ComplianceReviewPanelProps {
  bookingId: string;
}

export function ComplianceReviewPanel({ bookingId }: ComplianceReviewPanelProps) {
  const queryClient = useQueryClient();
  const [assessment, setAssessment] = React.useState<LicenseAiAssessment | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["admin-compliance", bookingId],
    queryFn: () => getAdminComplianceStatus(bookingId),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyLicenseAi(bookingId),
    onSuccess: (result) => {
      setAssessment(result);
      setError(null);
    },
    onError: () => setError("AI verification failed. Please review the photo manually."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmLicense(bookingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-compliance", bookingId] }),
    onError: () => setError("Couldn't confirm the license. Please try again."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading compliance details…</p>;
  if (!status || !status.signedAt) {
    return <p className="text-sm text-muted-foreground">The customer hasn't submitted pre-drive compliance yet.</p>;
  }

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>License #: {status.licenseNumber ?? "—"}</span>
        <Badge variant={status.licenseVerified ? "success" : "warning"}>
          {status.licenseVerified ? "License Verified" : "Pending Verification"}
        </Badge>
        <Badge variant={status.consentAccepted ? "success" : "destructive"}>
          {status.consentAccepted ? "Consent Accepted" : "No Consent"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        {status.licenseImageUrl && (
          <a href={status.licenseImageUrl} target="_blank" rel="noreferrer">
            <img src={status.licenseImageUrl} alt="Submitted license" className="h-24 rounded-md border object-cover" />
          </a>
        )}
        {status.signatureImageUrl && (
          <a href={status.signatureImageUrl} target="_blank" rel="noreferrer">
            <img src={status.signatureImageUrl} alt="Customer signature" className="h-24 rounded-md border bg-white object-contain" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>
          {verifyMutation.isPending ? "Running AI Check…" : "Run AI License Check"}
        </Button>
        {!status.licenseVerified && (
          <Button size="sm" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
            {confirmMutation.isPending ? "Confirming…" : "Confirm License"}
          </Button>
        )}
      </div>

      {assessment && (
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">AI Read (advisory only — verify manually)</p>
          <p>Name: {assessment.extractedName ?? "Not detected"}</p>
          <p>License #: {assessment.extractedLicenseNumber ?? "Not detected"}</p>
          <p>Expiry: {assessment.extractedExpiryDate ?? "Not detected"}</p>
          {assessment.flags.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-destructive">
              {assessment.flags.map((flag) => (
                <li key={flag}>{FLAG_LABELS[flag] ?? flag}</li>
              ))}
            </ul>
          )}
          {assessment.notes && <p className="mt-2 text-muted-foreground">{assessment.notes}</p>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
