import * as React from "react";
import { Link, Outlet } from "react-router-dom";
import { Car, Clock, Menu, MapPin, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useDealershipConfig } from "@/hooks/use-dealership-config";

export function AppLayout() {
  const { isAuthenticated, logout } = useAuth();
  const { data: dealership } = useDealershipConfig();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
            <span
              className="flex h-10 w-10 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: dealership?.primaryColorHex ?? "#EB0A1E" }}
            >
              <Car className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-bold leading-tight tracking-tight">
                {dealership?.name ?? "Toyota Indore"}
              </span>
              <span className="block text-xs leading-tight text-muted-foreground">
                {dealership?.tagline ?? "Authorized Toyota Dealer"}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link to="/vehicles" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Explore Vehicles
            </Link>
            {isAuthenticated && (
              <Link to="/my-bookings" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                My Test Drives
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={logout}>
                Sign out
              </Button>
            ) : (
              <Link to="/login" className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">
                Sign in
              </Link>
            )}
            <Link to="/vehicles" className="hidden sm:inline-block">
              <Button size="sm">Book a Test Drive</Button>
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
                Explore Vehicles
              </Link>
              {isAuthenticated && (
                <Link to="/my-bookings" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                  My Test Drives
                </Link>
              )}
              <Link to="/vehicles" className="mt-1" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full">Book a Test Drive</Button>
              </Link>
              {isAuthenticated ? (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                  Sign out
                </Button>
              ) : (
                <Link to="/login" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                  Sign in
                </Link>
              )}
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
              <p className="font-semibold text-foreground">{dealership?.name ?? "Toyota Indore"}</p>
              <p className="mt-1">{dealership?.tagline ?? "Authorized Toyota Dealer"}</p>
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
            &copy; {new Date().getFullYear()} {dealership?.name ?? "Toyota Indore"}. Vehicle specifications and pricing shown are illustrative and subject to change.
          </p>
        </div>
      </footer>
    </div>
  );
}
