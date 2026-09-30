import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Gauge, Heart, Users } from "lucide-react";
import type { VehicleDto } from "@tdm/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PlaceholderVehicleImage } from "@/components/PlaceholderVehicleImage";
import { cn } from "@/lib/utils";

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

interface VehicleCardProps {
  vehicle: VehicleDto;
  index?: number;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
}

export function VehicleCard({ vehicle, index = 0, isWishlisted, onToggleWishlist }: VehicleCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden">
          {vehicle.primaryImageUrl ? (
            <img
              src={vehicle.primaryImageUrl}
              alt={`${vehicle.make} ${vehicle.model}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlaceholderVehicleImage bodyType={vehicle.bodyType} label={`${vehicle.make} ${vehicle.model}`} />
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {vehicle.isBestSeller && <Badge variant="success">Best Seller</Badge>}
            {vehicle.isNewLaunch && <Badge variant="warning">New Launch</Badge>}
          </div>
          {onToggleWishlist && (
            <button
              type="button"
              aria-label={isWishlisted ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={isWishlisted}
              onClick={(e) => {
                e.preventDefault();
                onToggleWishlist();
              }}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
            >
              <Heart className={cn("h-4 w-4", isWishlisted && "fill-destructive text-destructive")} />
            </button>
          )}
        </div>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {vehicle.bodyType} · {vehicle.fuelType} · {vehicle.transmission}
          </p>
        </CardHeader>
        <CardContent className="flex-1 space-y-2">
          <p className="text-lg font-bold text-foreground">
            {formatInr(vehicle.price.amount)}
            {vehicle.priceMax && vehicle.priceMax.amount !== vehicle.price.amount && (
              <span className="text-sm font-normal text-muted-foreground"> – {formatInr(vehicle.priceMax.amount)}</span>
            )}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {vehicle.seatingCapacity && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {vehicle.seatingCapacity} seats
              </span>
            )}
            {vehicle.mileageKmpl && (
              <span className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" /> {vehicle.mileageKmpl} km/l
              </span>
            )}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Link to={`/vehicles/${vehicle.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>
            View Details
          </Link>
          <Link to={`/book/${vehicle.id}`} className={cn(buttonVariants({ variant: "default", size: "sm" }), "flex-1")}>
            Book Test Drive
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
