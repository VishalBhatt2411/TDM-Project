import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { brandAssetUrl, getDealershipConfig } from "@/api/config";
import type { DealershipConfigDto, SiteFeaturesDto } from "@/api/config";
import { hexToRgb, isHexColor, mixRgb, readableOn, rgbToHslTriplet, WHITE } from "@/lib/color";

const HTTPS_URL = /^https:\/\//i;
const BRAND_ASSET_PREFIX = brandAssetUrl("");

/** Theme variables a tenant brand colour replaces on the customer site. */
const THEME_VARIABLES = ["--primary", "--primary-foreground", "--ring"] as const;

export function useDealershipConfig() {
  return useQuery({
    queryKey: ["dealership-config"],
    queryFn: getDealershipConfig,
    staleTime: 5 * 60_000,
  });
}

const FEATURES_UNTIL_LOADED: SiteFeaturesDto = { wishlist: false, aiRecommendations: false, qrCheckIn: false };

/** Which optional features this site offers — all hidden until the config arrives, so a switched-off one never flashes in. */
export function useSiteFeatures(): SiteFeaturesDto {
  return useDealershipConfig().data?.features ?? FEATURES_UNTIL_LOADED;
}

/** An image the site may load: an https URL, or a brand image uploaded to this API. */
export function safeImageUrl(url: string | undefined): string | undefined {
  return url && (HTTPS_URL.test(url) || url.startsWith(BRAND_ASSET_PREFIX)) ? url : undefined;
}

/** The dealership's logo URL, when it's one the site may load. */
export function brandLogoUrl(config?: DealershipConfigDto): string | undefined {
  return safeImageUrl(config?.logoUrl);
}

/**
 * Themes the whole customer site with the brand colour: `--primary` (buttons, links, icons),
 * a `--primary-foreground` picked for contrast, and `--ring`. Restores the stylesheet's own
 * theme when the colour is cleared or the layout unmounts (e.g. navigating into the admin console).
 */
export function useBrandTheme(primaryColorHex: string | undefined) {
  React.useEffect(() => {
    if (!isHexColor(primaryColorHex)) return;
    const root = document.documentElement.style;
    const rgb = hexToRgb(primaryColorHex);
    root.setProperty("--primary", rgbToHslTriplet(rgb));
    root.setProperty("--primary-foreground", rgbToHslTriplet(readableOn(rgb)));
    root.setProperty("--ring", rgbToHslTriplet(mixRgb(rgb, WHITE, 0.85)));
    return () => THEME_VARIABLES.forEach((name) => root.removeProperty(name));
  }, [primaryColorHex]);
}

/** Home-page copy: the tenant's text for the current language when set, else the app's own translation. */
export function useSiteCopy(config?: DealershipConfigDto) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = config?.content.copy[language];
  return React.useCallback((key: string) => copy?.[key] || t(`home.${key}`), [copy, t]);
}
