/**
 * The features an admin can switch — a registry of what the code actually gates, not an open
 * key/value store. A flag is set company-wide, per dealership or per branch (the most specific
 * setting wins); a flag set nowhere takes its `defaultEnabled`, so a new tenant starts with
 * the full product and switches off what it doesn't offer.
 */
export const FEATURE_FLAGS = [
  {
    key: "ai_recommendations",
    label: "AI vehicle recommendations",
    description: "Show personalized vehicle recommendations on the customer dashboard.",
    defaultEnabled: true,
  },
  { key: "wishlist", label: "Wishlist", description: "Let customers save vehicles to a wishlist.", defaultEnabled: true },
  {
    key: "qr_check_in",
    label: "QR check-in",
    description: "Let customers show a QR code at the dealership and staff check them in by scanning it.",
    defaultEnabled: true,
  },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FEATURE_FLAGS.map((flag) => flag.key);

export function featureFlagDefault(key: FeatureFlagKey): boolean {
  return FEATURE_FLAGS.find((flag) => flag.key === key)?.defaultEnabled ?? false;
}
