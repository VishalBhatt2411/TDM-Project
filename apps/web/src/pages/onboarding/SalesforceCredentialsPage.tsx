import * as React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import {
  getOrganizationStatus,
  getSalesforceAuthorizeUrl,
  hasOnboardingSession,
  resendVerificationEmail,
  saveSalesforceCredentials,
} from "@/api/onboarding";
import { OnboardingUnavailable } from "@/components/onboarding/OnboardingUnavailable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api-error";

export function SalesforceCredentialsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [consumerKey, setConsumerKey] = React.useState("");
  const [consumerSecret, setConsumerSecret] = React.useState("");
  const [loginUrl, setLoginUrl] = React.useState("");

  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["onboarding", organizationId, "status"],
    queryFn: () => getOrganizationStatus(organizationId!),
    enabled: !!organizationId && hasOnboardingSession(organizationId),
    // The confirmation link is opened in another tab/mail app — pick the result up without a manual reload.
    refetchInterval: (query) => (query.state.data?.emailVerified ? false : 5000),
  });
  const emailPending = status.data?.emailVerified === false;
  const resend = useMutation({ mutationFn: () => resendVerificationEmail(organizationId!) });

  const mutation = useMutation({
    mutationFn: async () => {
      await saveSalesforceCredentials(organizationId!, { consumerKey, consumerSecret, loginUrl: loginUrl.trim() || undefined });
      return getSalesforceAuthorizeUrl(organizationId!);
    },
    onSuccess: (authorizationUrl) => {
      // Full-page navigation, same convention as AdminLoginPage's "Login with Salesforce" —
      // this must leave the SPA entirely to reach Salesforce's hosted authorization page.
      window.location.href = authorizationUrl;
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ["onboarding", organizationId, "status"] }),
  });
  const saveError = errorMessage(mutation.error, "Couldn't save these credentials. Double-check them and try again.");

  if (!organizationId || !hasOnboardingSession(organizationId)) return <OnboardingUnavailable />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <KeyRound className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Connect Your Salesforce Org</CardTitle>
          <CardDescription>Paste the Consumer Key and Consumer Secret from the Connected App you just created.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {emailPending && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                Confirm your email first — we sent you a link. This page unlocks as soon as you open it.{" "}
                <button
                  type="button"
                  className="font-medium underline disabled:opacity-60"
                  disabled={resend.isPending || resend.isSuccess}
                  onClick={() => resend.mutate()}
                >
                  {resend.isSuccess ? "Sent — check your inbox" : resend.isPending ? "Sending…" : "Resend the email"}
                </button>
                {resend.isError && <span className="block text-destructive">Couldn't resend right now. Try again in a minute.</span>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="consumerKey">Consumer Key</Label>
              <Input id="consumerKey" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} required minLength={10} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consumerSecret">Consumer Secret</Label>
              <Input
                id="consumerSecret"
                type="password"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                required
                minLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loginUrl">
                Salesforce Login URL <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="loginUrl"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                type="url"
                pattern="https://.*"
                placeholder="https://your-domain.my.salesforce.com"
              />
              <p className="text-xs text-muted-foreground">
                Find this under Setup → My Domain. Leave blank to use the default Salesforce login page — but many orgs require their own My
                Domain URL here, or the connection will fail with "cross-org OAuth" blocked.
              </p>
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {saveError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending || emailPending}>
              {mutation.isPending ? "Connecting…" : "Connect with Salesforce"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You'll be redirected to Salesforce to sign in and approve access — that's normal, and we never see your Salesforce password.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
