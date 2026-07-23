import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export function MagicLoginPage() {
  const [searchParams] = useSearchParams();
  const { magicLogin } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading");
  // The magic-link token is single-use, and React StrictMode intentionally invokes
  // effects twice in dev — without this guard, the second (now-guaranteed-to-fail)
  // call could overwrite a successful first login with an "invalid link" error.
  const hasAttempted = React.useRef(false);

  React.useEffect(() => {
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    magicLogin(token)
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate("/my-bookings"), 1200);
      })
      .catch(() => setStatus("error"));
  }, [searchParams, magicLogin, navigate]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      {status === "loading" && <p className="text-muted-foreground">Signing you in…</p>}
      {status === "success" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="mt-3 text-lg font-medium">You're signed in! Redirecting to your bookings…</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-10 w-10 text-destructive" />
          <p className="mt-3 text-lg font-medium">This sign-in link is invalid or has expired.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try booking a new test drive, or log in with your email and password.
          </p>
        </>
      )}
    </div>
  );
}
