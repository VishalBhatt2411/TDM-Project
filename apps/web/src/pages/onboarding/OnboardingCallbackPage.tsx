import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { completeOnboarding, getOrganizationStatus } from "@/api/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingUnavailable } from "@/components/onboarding/OnboardingUnavailable";
import { forgetOnboardingToken } from "@/lib/onboarding-session";
import { errorMessage } from "@/lib/api-error";

/** Polls until the wizard's terminal states (connected+deployed, or a hard connection error) are reached. */
function shouldKeepPolling(status?: { connectionStatus: string; metadataDeployedAt: string | null }): boolean {
  if (!status) return true;
  if (status.connectionStatus === "error") return false;
  return status.connectionStatus !== "connected" || !status.metadataDeployedAt;
}

/** The package deploy normally takes well under a minute; past this it was most likely cut off, and nothing will finish it. */
const DEPLOY_STALLED_AFTER_MS = 3 * 60_000;

export function OnboardingCallbackPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const openedAt = useRef(Date.now());

  const completeMutation = useMutation({
    mutationFn: () => completeOnboarding(organizationId!),
    onSuccess: () => forgetOnboardingToken(organizationId!),
  });
  // Once provisioned the onboarding token is discarded, so further status polls would 401 — stop them
  // and keep showing the success screen from the data already loaded.
  const completed = completeMutation.isSuccess;

  const { data: org, isLoading, isError } = useQuery({
    queryKey: ["onboarding-status", organizationId],
    queryFn: () => getOrganizationStatus(organizationId!),
    enabled: !!organizationId && !completed,
    refetchInterval: (query) => (shouldKeepPolling(query.state.data) ? 2500 : false),
  });

  if (isError && !completed) return <OnboardingUnavailable />;

  if (isLoading || !org) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (completeMutation.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-green-600" />
            <CardTitle>You're all set</CardTitle>
            <CardDescription>
              {org.name} is connected, and {completeMutation.data.email} has been provisioned as its first Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              Your company identifier is <span className="font-mono font-semibold">{org.slug}</span> — you'll use it to sign in.
            </p>
            <Button className="w-full" onClick={() => navigate(`/admin/login?org=${encodeURIComponent(org.slug)}`)}>
              Sign in to the Admin Console
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (org.connectionStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <XCircle className="mb-2 h-8 w-8 text-destructive" />
            <CardTitle>Couldn't connect to Salesforce</CardTitle>
            <CardDescription>{org.connectionError ?? "Something went wrong during the connection."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate(`/onboarding/${org.id}/credentials`)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingDeploy = org.connectionStatus === "connected" && !org.metadataDeployedAt;
  const deployFailed = pendingDeploy && !!org.connectionError;
  const deployStalled = pendingDeploy && !org.connectionError && Date.now() - openedAt.current > DEPLOY_STALLED_AFTER_MS;
  const isDeploying = pendingDeploy && !org.connectionError && !deployStalled;
  const ready = org.connectionStatus === "connected" && !!org.metadataDeployedAt;
  const needsRetry = deployFailed || deployStalled;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          {!ready && !needsRetry && <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" />}
          {needsRetry && <XCircle className="mb-2 h-8 w-8 text-destructive" />}
          {ready && <CheckCircle2 className="mb-2 h-8 w-8 text-green-600" />}
          <CardTitle>
            {org.connectionStatus === "pending" && "Finishing Salesforce authorization…"}
            {isDeploying && "Setting up your TDM workspace…"}
            {needsRetry && "Setup didn't finish"}
            {ready && "Salesforce connected"}
          </CardTitle>
          <CardDescription>
            {org.connectionStatus === "pending" && "This should only take a moment."}
            {isDeploying && "Deploying the test-drive management package to your org."}
            {deployFailed && "The Salesforce connection succeeded, but deploying the TDM package hit an issue."}
            {deployStalled && "The Salesforce connection succeeded, but deploying the TDM package is taking far longer than expected."}
            {ready && "Your org is fully set up and ready to go."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deployFailed && (
            <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">{org.connectionError}</p>
          )}
          {needsRetry && (
            // Authorizing again re-runs the deploy; the admin is only granted once it succeeds.
            <Button className="w-full" onClick={() => navigate(`/onboarding/${org.id}/credentials`)}>
              Reconnect and retry setup
            </Button>
          )}
          {ready && (
            <Button className="w-full" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? "Provisioning…" : "Provision My Admin Account"}
            </Button>
          )}
          {completeMutation.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(completeMutation.error, "Couldn't provision your admin account. Please try again.")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
