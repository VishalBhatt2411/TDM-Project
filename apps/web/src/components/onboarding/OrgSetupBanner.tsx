import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { getOnboardingSetupStatus } from "@/api/onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectOrgConfirmDialog } from "@/components/onboarding/ConnectOrgConfirmDialog";

/** Shown on the Admin Console's pre-login screen when the selected company hasn't completed self-service Salesforce setup yet. */
export function OrgSetupBanner({ organizationSlug }: { organizationSlug?: string }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { data } = useQuery({
    queryKey: ["onboarding-setup-status", organizationSlug ?? null],
    queryFn: () => getOnboardingSetupStatus(organizationSlug),
    staleTime: 30_000,
  });

  if (!data?.needsSetup) return null;

  return (
    <>
      <Badge variant="warning" className="mb-4 flex w-full max-w-sm items-start gap-2 rounded-md px-3 py-2.5 text-left font-normal">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">
          <span className="block font-semibold">Dealership setup isn't complete</span>
          <span className="mt-0.5 block text-xs">Connect your Salesforce org to start using the Admin Console.</span>
          <Button size="sm" className="mt-2 h-7 px-2.5 text-xs" onClick={() => setConfirmOpen(true)}>
            Set Up Your Org
          </Button>
        </span>
      </Badge>
      <ConnectOrgConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} />
    </>
  );
}
