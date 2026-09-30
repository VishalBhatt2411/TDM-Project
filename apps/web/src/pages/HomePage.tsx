import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Calendar, Car, ShieldCheck, Sparkles } from "lucide-react";
import { getFeaturedVehicles } from "@/api/vehicles";
import { VehicleCard } from "@/components/VehicleCard";
import { Button } from "@/components/ui/button";
import { safeImageUrl, useDealershipConfig, useSiteCopy } from "@/hooks/use-dealership-config";
import { useShoppingLocation } from "@/context/location-context";
import { heroBackground } from "@/lib/brand-hero";

type VehicleKind = "featured" | "bestSeller" | "newLaunch";

/** Home-page vehicle sections in display order, keyed as the tenant's content toggles them. */
const VEHICLE_SECTIONS: { key: string; kind: VehicleKind; titleKey: string; icon: ReactNode }[] = [
  { key: "featured", kind: "featured", titleKey: "home.featuredVehicles", icon: <Sparkles className="h-5 w-5 text-primary" /> },
  { key: "bestSellers", kind: "bestSeller", titleKey: "home.bestSellers", icon: <Car className="h-5 w-5 text-primary" /> },
  { key: "newLaunches", kind: "newLaunch", titleKey: "home.newLaunches", icon: <Calendar className="h-5 w-5 text-primary" /> },
];

const FEATURES = [
  { n: 1, icon: Car },
  { n: 2, icon: Calendar },
  { n: 3, icon: ShieldCheck },
] as const;

function VehicleSection({ title, icon, kind }: { title: string; icon: ReactNode; kind: VehicleKind }) {
  const { location, isReady } = useShoppingLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["featured-vehicles", kind, location.city, location.branchId],
    queryFn: () => getFeaturedVehicles(kind, location),
    enabled: isReady,
  });

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
  const { data: dealership, isLoading } = useDealershipConfig();
  const { t } = useTranslation();
  const copy = useSiteCopy(dealership);
  const heroImageUrl = safeImageUrl(dealership?.content.heroImageUrl);

  return (
    <div>
      <section className="relative overflow-hidden text-white" style={{ background: heroBackground("hsl(var(--primary))") }}>
        {heroImageUrl && (
          <>
            <img src={heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 opacity-[0.85]" style={{ background: heroBackground("hsl(var(--primary))") }} />
          </>
        )}
        <div className="relative mx-auto max-w-6xl px-4 py-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/80">
              <Sparkles className="h-4 w-4" /> {dealership?.name ?? <span className="inline-block h-4 w-32 animate-pulse rounded bg-white/20" />}
            </p>
            {isLoading ? (
              <div className="space-y-3" aria-hidden>
                <div className="h-10 max-w-xl animate-pulse rounded bg-white/20" />
                <div className="h-6 max-w-md animate-pulse rounded bg-white/20" />
              </div>
            ) : (
              <>
                <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{copy("heroTitle")}</h1>
                <p className="mt-4 max-w-xl text-lg text-white/85">{copy("heroSubtitle")}</p>
              </>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/vehicles">
                <Button size="lg" variant="default" className="bg-white text-slate-900 hover:bg-white/90">
                  {t("home.bookATestDrive")}
                </Button>
              </Link>
              <Link to="/vehicles">
                <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                  {t("home.exploreLineup")}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3">
          {FEATURES.map(({ n, icon: Icon }) => (
            <div key={n} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">{copy(`feature${n}Title`)}</p>
                <p className="text-sm text-muted-foreground">{copy(`feature${n}Body`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {dealership &&
        VEHICLE_SECTIONS.filter((section) => dealership.content.sections[section.key] !== false).map((section) => (
          <VehicleSection key={section.key} title={t(section.titleKey)} icon={section.icon} kind={section.kind} />
        ))}

      <section className="mx-auto max-w-6xl px-4 py-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{copy("ctaTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{copy("ctaSubtitle")}</p>
        <Link to="/vehicles">
          <Button size="lg" className="mt-6">
            {t("home.exploreAllVehicles")}
          </Button>
        </Link>
      </section>
    </div>
  );
}
