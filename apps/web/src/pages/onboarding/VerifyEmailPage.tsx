import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { verifyOrganizationEmail } from "@/api/onboarding";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Landing page of the emailed confirmation link (`#org=<id>&token=<token>`). The token rides in
 * the URL fragment so it never reaches a server log, and is wiped from the address bar on load.
 */
export function VerifyEmailPage() {
  const [credentials] = React.useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return { organizationId: params.get("org") ?? "", token: params.get("token") ?? "" };
  });
  const wellFormed = UUID_PATTERN.test(credentials.organizationId) && TOKEN_PATTERN.test(credentials.token);

  React.useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // A query (not an effect) so React StrictMode's double mount can't spend the single-use token twice.
  const verification = useQuery({
    queryKey: ["onboarding", "verify-email", credentials.organizationId],
    queryFn: () => verifyOrganizationEmail(credentials),
    enabled: wellFormed,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const failed = !wellFormed || verification.isError;
  const working = wellFormed && !verification.isSuccess && !verification.isError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          {working && <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" />}
          {verification.isSuccess && <CheckCircle2 className="mb-2 h-8 w-8 text-primary" />}
          {failed && <MailWarning className="mb-2 h-8 w-8 text-destructive" />}
          <CardTitle>{working ? "Confirming your email…" : failed ? "Link not valid" : "Email confirmed"}</CardTitle>
          <CardDescription>
            {working && "One moment."}
            {verification.isSuccess && "Go back to your setup page — it unlocks automatically. If you closed it, restart setup from the sign-in page."}
            {failed && "This confirmation link is invalid or has expired. Open your setup page and choose “Resend the email”."}
          </CardDescription>
        </CardHeader>
        {!working && (
          <CardContent>
            <Link to="/onboarding" className={buttonVariants({ variant: "outline" })}>
              Back to setup
            </Link>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
