import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addToWishlist, listWishlist, removeFromWishlist } from "@/api/customers";
import { useAuth } from "@/context/auth-context";
import { useSiteFeatures } from "@/hooks/use-dealership-config";

const WISHLIST_KEY = ["wishlist"];

/** Central wishlist state — used by VehicleCard's heart toggle, the vehicle detail page, and the dedicated wishlist page, so they always agree on what's saved. */
export function useWishlist() {
  const { isAuthenticated } = useAuth();
  const { wishlist: enabled } = useSiteFeatures();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WISHLIST_KEY,
    queryFn: listWishlist,
    enabled: isAuthenticated && enabled,
  });

  const wishlistedIds = new Set((query.data ?? []).map((v) => v.id));

  const addMutation = useMutation({
    mutationFn: addToWishlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWishlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });

  const toggle = (vehicleId: string) => {
    if (wishlistedIds.has(vehicleId)) {
      removeMutation.mutate(vehicleId);
    } else {
      addMutation.mutate(vehicleId);
    }
  };

  return {
    /** Whether this site offers a wishlist at all. */
    enabled,
    vehicles: query.data ?? [],
    isLoading: query.isLoading,
    wishlistedIds,
    toggle,
    isPending: addMutation.isPending || removeMutation.isPending,
  };
}
