import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Puzzle } from "lucide-react";
import { getOrganizationStatus } from "@/api/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <code className="flex-1 whitespace-pre-line break-all text-sm">{value}</code>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ConnectedAppInstructionsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const { data: org, isLoading, isError } = useQuery({
    queryKey: ["onboarding-status", organizationId],
    queryFn: () => getOrganizationStatus(organizationId!),
    enabled: !!organizationId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (isError || !org) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-destructive">Couldn't find that organization. Start over from the beginning.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <Puzzle className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Create a Connected App in Salesforce</CardTitle>
          <CardDescription>
            One-time setup in your own Salesforce org for <span className="font-medium text-foreground">{org.name}</span>. Takes about 5 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              In Salesforce Setup, go to <span className="font-medium">App Manager</span> → <span className="font-medium">New Connected App</span>.
            </li>
            <li>
              Enter any Connected App Name and Contact Email, then enable <span className="font-medium">OAuth Settings</span>.
            </li>
            <li>
              Paste these Callback URLs exactly as shown, one per line — the first connects your org, the second lets your staff sign in:
            </li>
          </ol>
          <CopyableField label="Callback URLs" value={org.salesforceCallbackUrls.join("\n")} />
          <ol start={4} className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Under Selected OAuth Scopes, add all three: <span className="font-medium">Manage user data via APIs (api)</span>,{" "}
              <span className="font-medium">Perform requests at any time (refresh_token, offline_access)</span>, and{" "}
              <span className="font-medium">Access your basic information (id, profile, email, address, phone)</span>.
            </li>
            <li>
              Check <span className="font-medium">Require Proof Key for Code Exchange (PKCE)</span> and save.
            </li>
            <li>
              Salesforce takes a few minutes to activate a new Connected App. Once it's ready, open it and copy its{" "}
              <span className="font-medium">Consumer Key</span> and <span className="font-medium">Consumer Secret</span> — you'll paste those next.
            </li>
            <li>
              If you created an <span className="font-medium">External Client App</span> instead, its OAuth policies allow sign-in only from its
              own org — use that org's My Domain URL on the next step, and sign in as a user of that same org.
            </li>
            <li>
              Also note your org's <span className="font-medium">My Domain URL</span> (Setup → My Domain) — you'll need it on the next step for
              orgs that don't allow connecting through the default Salesforce login page.
            </li>
          </ol>
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Some Salesforce orgs block creating Connected Apps through automated tools entirely, so this manual step works for every org, including
            yours.
          </p>
          <Button className="w-full" onClick={() => navigate(`/onboarding/${org.id}/credentials`)}>
            I've created my Connected App
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
