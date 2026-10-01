import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rememberOnboardingToken } from "@/lib/onboarding-session";
import { OnboardingUnavailable } from "@/components/onboarding/OnboardingUnavailable";

const SETUP_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Landing page of a setup link issued by the platform operator (`#setup=<token>`). The token
 * rides in the URL fragment so it never reaches a server; it's stored like a token issued at
 * creation, wiped from the address bar, and the wizard continues from the Connected App step.
 */
export function ResumeOnboardingPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const [token] = React.useState(() => new URLSearchParams(window.location.hash.slice(1)).get("setup") ?? "");
  const valid = !!organizationId && SETUP_TOKEN_PATTERN.test(token);

  React.useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    if (!valid) return;
    rememberOnboardingToken(organizationId!, token);
    navigate(`/onboarding/${organizationId}/connected-app`, { replace: true });
  }, [valid, organizationId, token, navigate]);

  return valid ? null : <OnboardingUnavailable />;
}
