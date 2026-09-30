import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { VehicleCard } from "@/components/VehicleCard";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/use-wishlist";

export function WishlistPage() {
  const wishlist = useWishlist();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Wishlist</h1>
        <p className="text-sm text-muted-foreground">Vehicles you've saved for later.</p>
      </div>

      {wishlist.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!wishlist.isLoading && wishlist.vehicles.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Heart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Nothing saved yet — tap the heart on any vehicle to add it here.</p>
          <Link to="/vehicles" className="mt-4 inline-block">
            <Button size="sm">Explore Vehicles</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wishlist.vehicles.map((vehicle, i) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            index={i}
            isWishlisted
            onToggleWishlist={() => wishlist.toggle(vehicle.id)}
          />
        ))}
      </div>
    </div>
  );
}
