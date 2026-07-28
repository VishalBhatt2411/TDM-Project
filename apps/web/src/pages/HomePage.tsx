import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Car, ShieldCheck, Sparkles } from "lucide-react";
import { getFeaturedVehicles } from "@/api/vehicles";
import { VehicleCard } from "@/components/VehicleCard";
import { Button } from "@/components/ui/button";
import { useDealershipConfig } from "@/hooks/use-dealership-config";

function VehicleSection({ title, icon, kind }: { title: string; icon: ReactNode; kind: "featured" | "bestSeller" | "newLaunch" }) {
  const { data, isLoading } = useQuery({ queryKey: ["featured-vehicles", kind], queryFn: () => getFeaturedVehicles(kind) });

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-5 flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data!.slice(0, 4).map((vehicle, i) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const { data: dealership } = useDealershipConfig();

  return (
    <div>
      <section
        className="relative overflow-hidden text-white"
        style={{ background: `linear-gradient(135deg, ${dealership?.primaryColorHex ?? "#EB0A1E"}, #1a1a1a)` }}
      >
        <div className="mx-auto max-w-6xl px-4 py-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/80">
              <Sparkles className="h-4 w-4" /> {dealership?.name ?? "Toyota Indore"}
            </p>
            <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Experience the drive before you decide.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">
              Book a free test drive at your nearest showroom or right from your doorstep — no waiting, no hassle.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/vehicles">
                <Button size="lg" variant="default" className="bg-white text-slate-900 hover:bg-white/90">
                  Book a Test Drive
                </Button>
              </Link>
              <Link to="/vehicles">
                <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                  Explore the Lineup
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <Car className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Showroom or Home</p>
              <p className="text-sm text-muted-foreground">Choose to drive at our showroom or have us bring the car to you.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Book in Under a Minute</p>
              <p className="text-sm text-muted-foreground">No account needed upfront — just pick a slot and go.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Trusted Toyota Quality</p>
              <p className="text-sm text-muted-foreground">Every vehicle in our lineup, backed by Toyota's reliability.</p>
            </div>
          </div>
        </div>
      </section>

      <VehicleSection title="Featured Vehicles" icon={<Sparkles className="h-5 w-5 text-primary" />} kind="featured" />
      <VehicleSection title="Best Sellers" icon={<Car className="h-5 w-5 text-primary" />} kind="bestSeller" />
      <VehicleSection title="New Launches" icon={<Calendar className="h-5 w-5 text-primary" />} kind="newLaunch" />

      <section className="mx-auto max-w-6xl px-4 py-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Ready to feel it for yourself?</h2>
        <p className="mt-2 text-muted-foreground">Browse the full lineup and book your test drive today.</p>
        <Link to="/vehicles">
          <Button size="lg" className="mt-6">
            Explore All Vehicles
          </Button>
        </Link>
      </section>
    </div>
  );
}
