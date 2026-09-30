import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConnectOrgConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gate shown before entering the onboarding wizard — explains what connecting a Salesforce
 * org means (this platform gets a standing, reusable connection to it) and requires a
 * self-attestation that the person is the org's Salesforce System Administrator. This is
 * intentionally a confirmation, not a verified permission check: the wizard has no
 * Salesforce session yet at this point, so there's nothing to check against.
 */
export function ConnectOrgConfirmDialog({ open, onOpenChange }: ConnectOrgConfirmDialogProps) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (!open) setIsAdmin(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <Cloud className="mb-1 h-6 w-6 text-[#00A1E0]" />
        <DialogTitle>Connect your Salesforce org</DialogTitle>
        <DialogDescription>
          This links your dealership's own Salesforce org to this portal so it can read and write your test-drive data. You'll
          create a Connected App in your org and authorize access — no CLI or developer setup required.
        </DialogDescription>
      </DialogHeader>

      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        You'll need System Administrator access in your Salesforce org to create a Connected App and approve this connection.
        If that's not you, ask your Salesforce admin to complete this step instead.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox checked={isAdmin} onCheckedChange={setIsAdmin} aria-label="I am this organization's Salesforce System Administrator" />
        <span>I am this organization's Salesforce System Administrator (or acting with their access).</span>
      </label>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!isAdmin} onClick={() => navigate("/onboarding")}>
          Continue
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
