import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronLeft, MapPin } from "lucide-react";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useShoppingLocation, type ShoppingLocation } from "@/context/location-context";
import { cn } from "@/lib/utils";

function OptionButton({ selected, onClick, title, subtitle }: { selected: boolean; onClick: () => void; title: string; subtitle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

/**
 * Header control for the customer's city → branch. Asked once on first visit when the host
 * serves more than one city; hidden entirely when there's only one branch to choose from.
 */
export function LocationPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { location, hasChosen, isReady, branches, cities, setLocation } = useShoppingLocation();
  const [open, setOpen] = React.useState(false);
  // The city whose branches are listed; null shows the city list.
  const [browsingCity, setBrowsingCity] = React.useState<string | null>(null);
  const singleCity = cities.length === 1 ? cities[0] : null;

  React.useEffect(() => {
    if (isReady && !hasChosen && cities.length > 1) setOpen(true);
  }, [isReady, hasChosen, cities.length]);

  const openPicker = () => {
    setBrowsingCity(singleCity ?? location.city ?? null);
    setOpen(true);
  };

  // Closing without choosing still counts as a choice ("all cities"), so we don't ask again.
  const close = () => {
    if (!hasChosen) setLocation(location);
    setOpen(false);
  };

  const choose = (next: ShoppingLocation) => {
    setLocation(next);
    setOpen(false);
  };

  if (!isReady || branches.length <= 1) return null;

  const selectedBranch = branches.find((b) => b.id === location.branchId);
  const label = location.city
    ? `${location.city} · ${selectedBranch ? selectedBranch.name : t("location.allBranches")}`
    : t("location.allCities");
  const cityBranches = browsingCity ? branches.filter((b) => b.address.city === browsingCity) : [];

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-label={t("location.change", { location: label })}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogHeader>
          <DialogTitle>{browsingCity ? t("location.chooseBranch") : t("location.chooseCity")}</DialogTitle>
          <DialogDescription>{t("location.description")}</DialogDescription>
        </DialogHeader>

        {browsingCity ? (
          <div className="space-y-2">
            {!singleCity && (
              <button
                type="button"
                onClick={() => setBrowsingCity(null)}
                className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {t("location.allCitiesBack")}
              </button>
            )}
            <div className="-m-1 max-h-[50vh] space-y-2 overflow-y-auto overflow-x-hidden p-1">
              <OptionButton
                selected={location.city === browsingCity && !location.branchId}
                onClick={() => choose({ city: browsingCity })}
                title={t("location.allBranchesIn", { city: browsingCity })}
                subtitle={t("location.branchCount", { count: cityBranches.length })}
              />
              {cityBranches.map((branch) => (
                <OptionButton
                  key={branch.id}
                  selected={location.branchId === branch.id}
                  onClick={() => choose({ city: browsingCity, branchId: branch.id })}
                  title={branch.name}
                  subtitle={branch.address.line1}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="-m-1 max-h-[50vh] space-y-2 overflow-y-auto overflow-x-hidden p-1">
            <OptionButton selected={!location.city} onClick={() => choose({})} title={t("location.allCities")} />
            {cities.map((city) => (
              <OptionButton
                key={city}
                selected={location.city === city}
                onClick={() => setBrowsingCity(city)}
                title={city}
                subtitle={t("location.branchCount", { count: branches.filter((b) => b.address.city === city).length })}
              />
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}
