import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A wizard step reached without this browser's setup token, or for an organization that doesn't exist. */
export function OnboardingUnavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <ShieldAlert className="mb-2 h-8 w-8 text-muted-foreground" />
          <CardTitle>This setup can't be continued here</CardTitle>
          <CardDescription>
            For security, a company's setup can only be continued in the browser that started it. Open it there, or start a new setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/onboarding" className={cn(buttonVariants(), "w-full")}>
            Start a new setup
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
