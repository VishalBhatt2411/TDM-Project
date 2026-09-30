import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapPin, Phone } from "lucide-react";
import { listBranches } from "@/api/branches";
import { useShoppingLocation } from "@/context/location-context";
import { BranchMap } from "@/components/BranchMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function BranchLocatorPage() {
  const { data: branches, isLoading, isError } = useQuery({ queryKey: ["branches"], queryFn: listBranches });
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | undefined>(undefined);
  const { setLocation } = useShoppingLocation();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Find a Branch</h1>
      <p className="mt-1 text-sm text-muted-foreground">Locate a showroom near you and book a test drive.</p>

      {isLoading && <div className="mt-6 h-[400px] animate-pulse rounded-md bg-muted" />}

      {isError && (
        <p className="mt-6 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Couldn't load branch locations. Please try again shortly.
        </p>
      )}

      {branches && branches.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No branches are available yet.
        </p>
      )}

      {branches && branches.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <BranchMap branches={branches} selectedBranchId={selectedBranchId} onSelectBranch={setSelectedBranchId} height={480} />
          <div className="space-y-3">
            {branches.map((branch) => (
              <Card
                key={branch.id}
                className={selectedBranchId === branch.id ? "border-primary" : undefined}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4 text-primary" /> {branch.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{branch.address.line1}, {branch.address.city}, {branch.address.state} {branch.address.postalCode}</p>
                  {branch.phone && (
                    <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {branch.phone}</p>
                  )}
                  {branch.operatingHours && <p>{branch.operatingHours}</p>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation({ city: branch.address.city, branchId: branch.id });
                      navigate("/vehicles");
                    }}
                  >
                    Book a Test Drive Here
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
