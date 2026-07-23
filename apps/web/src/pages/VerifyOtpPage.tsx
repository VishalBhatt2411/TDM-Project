import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";

export function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyOtp } = useAuth();
  const customerId = (location.state as { customerId?: string } | null)?.customerId ?? "";
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!customerId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center text-muted-foreground">
        No pending registration found. Please <a className="text-primary underline" href="/register">register</a> first.
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp({ customerId, code });
      navigate("/login", { state: { verified: true } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Invalid or expired code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verify your phone &amp; email</CardTitle>
          <CardDescription>
            We sent a 6-digit code. In this dev environment it's printed in the API server logs (
            <code className="rounded bg-muted px-1">ConsoleOtpSender</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting || code.length !== 6}>
              {isSubmitting ? "Verifying…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
