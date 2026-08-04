import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CircleDot, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { getRelatedVehicles, getVehicle, getVehicleVariants } from "@/api/vehicles";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AccordionItem } from "@/components/ui/accordion";
import { VehicleImageGallery } from "@/components/VehicleImageGallery";
import { ColorSelector } from "@/components/ColorSelector";
import { VehicleCard } from "@/components/VehicleCard";
import { EmiCalculator } from "@/components/EmiCalculator";
import { cn } from "@/lib/utils";

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const AVAILABILITY_LABEL: Record<string, string> = {
  In_Stock: "In Stock",
  Limited_Stock: "Limited Stock",
  On_Request: "Available on Request",
  Coming_Soon: "Coming Soon",
};

function HighlightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: vehicle, isLoading, isError } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => getVehicle(id!),
    enabled: !!id,
  });
  const { data: variants } = useQuery({
    queryKey: ["vehicle-variants", id],
    queryFn: () => getVehicleVariants(id!),
    enabled: !!id,
  });
  const { data: related } = useQuery({
    queryKey: ["vehicle-related", id],
    queryFn: () => getRelatedVehicles(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="aspect-[16/7] animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (isError || !vehicle) return <p className="p-8 text-destructive">Vehicle not found.</p>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Gallery */}
      <VehicleImageGallery
        images={vehicle.galleryUrls ?? []}
        label={`${vehicle.make} ${vehicle.model}`}
        bodyType={vehicle.bodyType}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {vehicle.isFeatured && <Badge variant="accent">Featured</Badge>}
            {vehicle.isBestSeller && <Badge variant="success">Best Seller</Badge>}
            {vehicle.isNewLaunch && <Badge variant="warning">New Launch</Badge>}
            <Badge variant="outline">{AVAILABILITY_LABEL[vehicle.availabilityStatus]}</Badge>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="mt-2 text-2xl font-semibold">
            {formatInr(vehicle.price.amount)}
            {vehicle.priceMax && vehicle.priceMax.amount !== vehicle.price.amount && (
              <span className="text-base font-normal text-muted-foreground"> – {formatInr(vehicle.priceMax.amount)} (ex-showroom)</span>
            )}
          </p>
          {vehicle.description && <p className="mt-4 text-muted-foreground">{vehicle.description}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Fuel Type</p><p className="font-medium">{vehicle.fuelType}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Transmission</p><p className="font-medium">{vehicle.transmission}</p></CardContent></Card>
            {vehicle.seatingCapacity && <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Seating</p><p className="font-medium">{vehicle.seatingCapacity} seats</p></CardContent></Card>}
            {vehicle.mileageKmpl && <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Mileage</p><p className="font-medium">{vehicle.mileageKmpl} km/l</p></CardContent></Card>}
          </div>

          {vehicle.safetyRatingStars && (
            <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {vehicle.safetyRatingStars}-star safety rating
            </div>
          )}

          {/* Highlights */}
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <HighlightList title="Safety Features" items={vehicle.safetyFeatures} />
            <HighlightList title="Infotainment" items={vehicle.infotainmentFeatures} />
            <HighlightList title="Exterior Highlights" items={vehicle.exteriorHighlights} />
            <HighlightList title="Interior Highlights" items={vehicle.interiorHighlights} />
          </div>

          {/* Engine options */}
          {vehicle.engineOptions.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">Engine Options</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Engine</th>
                      <th className="p-3">Displacement</th>
                      <th className="p-3">Power</th>
                      <th className="p-3">Torque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicle.engineOptions.map((e) => (
                      <tr key={e.name} className="border-t">
                        <td className="p-3 font-medium">{e.name}</td>
                        <td className="p-3">{e.displacement}</td>
                        <td className="p-3">{e.power}</td>
                        <td className="p-3">{e.torque}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Variants comparison */}
          {variants && variants.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">Variant Comparison</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Variant</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Engine</th>
                      <th className="p-3">Fuel</th>
                      <th className="p-3">Transmission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id} className="border-t">
                        <td className="p-3 font-medium">
                          {v.name} {v.isDefault && <Badge variant="secondary" className="ml-1">Popular</Badge>}
                        </td>
                        <td className="p-3">{formatInr(v.price.amount)}</td>
                        <td className="p-3">{v.engine}</td>
                        <td className="p-3">{v.fuelType}</td>
                        <td className="p-3">{v.transmission}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Colors */}
          <ColorSelector
            colors={vehicle.colors}
            galleryUrls={vehicle.galleryUrls ?? []}
            label={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          />

          {/* EMI Calculator */}
          <div className="mt-8">
            <EmiCalculator vehiclePrice={vehicle.price.amount} />
          </div>

          {/* FAQs */}
          {vehicle.faqs.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-1 text-lg font-semibold">Frequently Asked Questions</h2>
              <div>
                {vehicle.faqs.map((faq) => (
                  <AccordionItem key={faq.question} question={faq.question} answer={faq.answer} />
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5" /> Customer Reviews
            </h2>
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No reviews yet for this vehicle. Book a test drive and be the first to share your experience!
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sticky booking CTA */}
        <div>
          <div className="sticky top-24 rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Ready to experience the {vehicle.model}?</p>
            <Link to={`/book/${vehicle.id}`} className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-3 w-full")}>
              Book a Test Drive
            </Link>
            <p className="mt-3 text-center text-xs text-muted-foreground">Free · No account needed to get started</p>
          </div>
        </div>
      </div>

      {/* Related vehicles */}
      {related && related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> You Might Also Like
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((v, i) => (
              <VehicleCard key={v.id} vehicle={v} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
