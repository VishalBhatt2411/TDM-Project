import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getAdminRegional, listDealershipsLookup } from "@/api/admin";
import type { RegionalSettingsDto } from "@/api/config";
import { createRegionalFormatter, type RegionalFormatter } from "@/lib/regional";
import { useDealershipConfig } from "./use-dealership-config";

function useFormatter(settings: RegionalSettingsDto | undefined): RegionalFormatter {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return React.useMemo(() => createRegionalFormatter(settings, language), [settings, language]);
}

/** Formatting for the customer site — the regional settings of the dealership (or company) this host serves. */
export function useRegional(): RegionalFormatter {
  const { data } = useDealershipConfig();
  return useFormatter(data?.regional);
}

/** Formatting for the admin console — the company-wide settings; pass a dealership's zone for its bookings (see useDealershipTimeZones). */
export function useAdminRegional(): RegionalFormatter {
  const { data } = useQuery({ queryKey: ["admin-regional"], queryFn: getAdminRegional, staleTime: 5 * 60_000 });
  return useFormatter(data);
}

/** Each dealership's time zone, by id — shared with every other dealerships-lookup query. */
export function useDealershipTimeZones(): Map<string, string> {
  const { data } = useQuery({ queryKey: ["dealerships-lookup"], queryFn: listDealershipsLookup });
  return React.useMemo(() => new Map((data ?? []).map((d) => [d.id, d.timeZone])), [data]);
}
