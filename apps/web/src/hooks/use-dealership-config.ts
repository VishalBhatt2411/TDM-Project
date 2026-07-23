import { useQuery } from "@tanstack/react-query";
import { getDealershipConfig } from "@/api/config";

export function useDealershipConfig() {
  return useQuery({
    queryKey: ["dealership-config"],
    queryFn: getDealershipConfig,
    staleTime: 5 * 60_000,
  });
}
