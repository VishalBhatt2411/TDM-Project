import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrgSetupBanner } from "@/components/onboarding/OrgSetupBanner";
import { ConnectOrgConfirmDialog } from "@/components/onboarding/ConnectOrgConfirmDialog";

const ERROR_MESSAGES: Record<string, string> = {
  not_provisioned: "Your Salesforce account isn't provisioned for the Admin Console. Contact your administrator.",
  inactive: "This Admin Console account has been deactivated. Contact your administrator.",
  invalid_state: "That sign-in attempt expired or was invalid. Please try again.",
  invalid_request: "That sign-in link was malformed. Please start over.",
  unknown_organization: "We couldn't find a connected company with that identifier. Check it and try again.",
  wrong_organization: "That Salesforce account belongs to a different org than this company. Sign in with your company's Salesforce account.",
  exchange_failed: "Couldn't complete sign-in with Salesforce. Please try again.",
  internal_error: "Something went wrong on our end. Please try again shortly.",
};

// Mirrors the API's organization slug rule (apps/api/src/tenancy/organization-slug.ts).
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ORGANIZATION_SLUG_MAX_LENGTH = 63;
const LAST_ORGANIZATION_KEY = "tdm.admin.lastOrganization";

function readRememberedOrganization(): string {
  try {
    return localStorage.getItem(LAST_ORGANIZATION_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberOrganization(slug: string): void {
  try {
    if (slug) localStorage.setItem(LAST_ORGANIZATION_KEY, slug);
    else localStorage.removeItem(LAST_ORGANIZATION_KEY);
  } catch {
    // Storage unavailable (private mode / blocked) — remembering is only a convenience.
  }
}

export function AdminLoginPage() {
  const { loginWithSalesforce } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const [organization, setOrganization] = React.useState(() => searchParams.get("org") ?? readRememberedOrganization());
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const slug = organization.trim().toLowerCase();
  const isValidSlug = slug.length <= ORGANIZATION_SLUG_MAX_LENGTH && ORGANIZATION_SLUG_PATTERN.test(slug);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (slug && !isValidSlug) {
      setValidationError("Use lowercase letters, numbers and single hyphens only.");
      return;
    }
    setValidationError(null);
    rememberOrganization(slug);
    loginWithSalesforce(slug || undefined);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <OrgSetupBanner organizationSlug={slug && isValidSlug ? slug : undefined} />
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Admin Console</CardTitle>
          <CardDescription>Sign in with your Salesforce account to manage the dealership platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
            </p>
          )}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Company identifier</Label>
              <Input
                id="organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. acme-motors"
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={ORGANIZATION_SLUG_MAX_LENGTH}
                aria-invalid={!!validationError}
                aria-describedby="organization-hint"
              />
              <p id="organization-hint" className={validationError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {validationError ?? "Leave blank if you're on your company's own Admin Console address."}
              </p>
            </div>
            <Button type="submit" className="w-full">
              Login with Salesforce
            </Button>
          </form>
          <Button variant="link" className="mt-3 h-auto w-full p-0 text-xs" onClick={() => setConfirmOpen(true)}>
            New company? Connect your Salesforce org
          </Button>
        </CardContent>
      </Card>
      <ConnectOrgConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} />
    </div>
  );
}
