import * as React from "react";
import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Clock, Heart, Menu, MapPin, Phone, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { brandLogoUrl, useBrandTheme, useDealershipConfig, useSiteFeatures } from "@/hooks/use-dealership-config";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LocationPicker } from "@/components/LocationPicker";
import { LocationProvider } from "@/context/location-context";

/** The customer-facing shell; every page inside it shares the header's shopping location. */
export function AppLayout() {
  return (
    <LocationProvider>
      <AppShell />
    </LocationProvider>
  );
}

function AppShell() {
  const { isAuthenticated, logout } = useAuth();
  const { data: dealership, isLoading: isBrandLoading } = useDealershipConfig();
  const features = useSiteFeatures();
  const logoUrl = brandLogoUrl(dealership);
  useBrandTheme(dealership?.primaryColorHex);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Utility bar */}
      <div className="hidden bg-foreground text-background sm:block">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-1.5 text-xs">
          {dealership?.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> {dealership.phone}
            </span>
          )}
          {dealership?.operatingHours && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {dealership.operatingHours}
            </span>
          )}
          {dealership?.address && (
            <span className="ml-auto hidden items-center gap-1.5 md:flex">
              <MapPin className="h-3 w-3" /> {dealership.address}
            </span>
          )}
        </div>
      </div>

      {/* Main header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Car className="h-5 w-5" />
              </span>
            )}
            {isBrandLoading ? (
              <span className="block space-y-1.5" aria-hidden>
                <span className="block h-4 w-32 animate-pulse rounded bg-muted" />
                <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
              </span>
            ) : (
              <span className="min-w-0">
                <span className="block truncate text-base font-bold leading-tight tracking-tight">{dealership?.logoText ?? dealership?.name}</span>
                {dealership?.tagline && (
                  <span className="block truncate text-xs leading-tight text-muted-foreground">{dealership.tagline}</span>
                )}
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link to="/vehicles" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              {t("nav.exploreVehicles")}
            </Link>
            <Link to="/branches" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              {t("nav.findABranch")}
            </Link>
            {isAuthenticated && (
              <>
                <Link to="/my-bookings" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                  {t("nav.myTestDrives")}
                </Link>
                {features.wishlist && (
                  <Link to="/wishlist" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    {t("nav.wishlist")}
                  </Link>
                )}
                <Link to="/profile" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                  {t("nav.profile")}
                </Link>
              </>
            )}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <LocationPicker />
            <LanguageSwitcher className="hidden sm:inline-flex" />
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={logout}>
                {t("nav.signOut")}
              </Button>
            ) : (
              <Link to="/login" className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">
                {t("nav.signIn")}
              </Link>
            )}
            <Link to="/admin/login" className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">
              {t("nav.adminConsole")}
            </Link>
            <Link to="/vehicles" className="hidden sm:inline-block">
              <Button size="sm">{t("nav.bookATestDrive")}</Button>
            </Link>
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="rounded-md p-2 text-foreground md:hidden"
              onClick={() => setMobileMenuOpen((o) => !o)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              <Link to="/vehicles" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                {t("nav.exploreVehicles")}
              </Link>
              <Link to="/branches" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                <MapPin className="h-4 w-4" /> {t("nav.findABranch")}
              </Link>
              {isAuthenticated && (
                <>
                  <Link to="/my-bookings" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                    {t("nav.myTestDrives")}
                  </Link>
                  {features.wishlist && (
                    <Link to="/wishlist" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                      <Heart className="h-4 w-4" /> {t("nav.wishlist")}
                    </Link>
                  )}
                  <Link to="/profile" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                    <User className="h-4 w-4" /> {t("nav.profile")}
                  </Link>
                </>
              )}
              <Link to="/vehicles" className="mt-1" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full">{t("nav.bookATestDrive")}</Button>
              </Link>
              {isAuthenticated ? (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                  {t("nav.signOut")}
                </Button>
              ) : (
                <Link to="/login" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                  {t("nav.signIn")}
                </Link>
              )}
              <Link to="/admin/login" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                {t("nav.adminConsole")}
              </Link>
              <LanguageSwitcher className="mt-2 px-3" />
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="font-semibold text-foreground">{dealership?.name}</p>
              {dealership?.tagline && <p className="mt-1">{dealership.tagline}</p>}
            </div>
            <div>
              <p className="font-semibold text-foreground">Contact</p>
              <p className="mt-1">{dealership?.phone}</p>
              <p>{dealership?.email}</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Visit Us</p>
              <p className="mt-1">{dealership?.address}</p>
              <p>{dealership?.operatingHours}</p>
            </div>
          </div>
          <p className="mt-8 text-xs">
            &copy; {new Date().getFullYear()} {dealership?.name}. Vehicle specifications and pricing shown are illustrative and subject to change.
          </p>
        </div>
      </footer>
    </div>
  );
}
