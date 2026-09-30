import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Building2, Cloud } from "lucide-react";
import { createOrganization } from "@/api/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api-error";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "That connection attempt expired or was invalid. Please try connecting your Salesforce org again.",
  invalid_request: "That callback link was malformed. Please start over.",
  exchange_failed: "Couldn't complete the connection with Salesforce. Please try again.",
};

export function CreateOrganizationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get("error");
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);

  const mutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: (org) => navigate(`/onboarding/${org.id}/connected-app`),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Building2 className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Connect Your Dealership</CardTitle>
          <CardDescription>
            Set up your organization, then connect your own Salesforce org — no CLI or developer required.
          </CardDescription>
          <Badge variant="outline" className="mt-1 gap-1.5 font-normal text-muted-foreground">
            <Cloud className="h-3.5 w-3.5 text-[#00A1E0]" />
            Connects with Salesforce
          </Badge>
        </CardHeader>
        <CardContent>
          {callbackError && (
            <p className="mb-4 text-sm text-destructive">
              {CALLBACK_ERROR_MESSAGES[callbackError] ?? "Couldn't connect your Salesforce org. Please try again."}
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ name, slug });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Dealership / Company Name</Label>
              <Input
                id="orgName"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
                placeholder="Acme Motors"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgSlug">Identifier</Label>
              <Input
                id="orgSlug"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="acme-motors"
                required
                minLength={3}
              />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only. Used to identify your organization.</p>
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(mutation.error, "Couldn't create your organization. Please try again.")}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
