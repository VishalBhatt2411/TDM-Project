// The setup token the API issues once when the wizard creates a company. Every later wizard
// step needs it (an organization id alone opens nothing), so it is kept in this browser —
// localStorage rather than sessionStorage, so a closed tab or the Salesforce round-trip
// doesn't strand a half-finished setup. Storage can be unavailable (private mode, blocked
// site data); the wizard then works for the current page only.
const KEY_PREFIX = "tdm.onboarding-token.";
const memory = new Map<string, string>();

export function rememberOnboardingToken(organizationId: string, token: string): void {
  memory.set(organizationId, token);
  try {
    localStorage.setItem(KEY_PREFIX + organizationId, token);
  } catch {
    // Kept in memory only.
  }
}

export function onboardingTokenFor(organizationId: string): string | undefined {
  const cached = memory.get(organizationId);
  if (cached) return cached;
  try {
    return localStorage.getItem(KEY_PREFIX + organizationId) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Setup is finished — the token has no further use in this browser. */
export function forgetOnboardingToken(organizationId: string): void {
  memory.delete(organizationId);
  try {
    localStorage.removeItem(KEY_PREFIX + organizationId);
  } catch {
    // Nothing stored.
  }
}
