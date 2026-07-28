import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAdminAuth } from "@/context/admin-auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  not_provisioned: "Your Salesforce account isn't provisioned for the Admin Console. Contact your administrator.",
  inactive: "This Admin Console account has been deactivated. Contact your administrator.",
  invalid_state: "That sign-in attempt expired or was invalid. Please try again.",
  exchange_failed: "Couldn't complete sign-in with Salesforce. Please try again.",
};

export function AdminLoginPage() {
  const { loginWithSalesforce } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Admin Console</CardTitle>
          <CardDescription>Sign in with your Salesforce account to manage the dealership platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">{ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}</p>
          )}
          <Button className="w-full" onClick={loginWithSalesforce}>
            Login with Salesforce
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
