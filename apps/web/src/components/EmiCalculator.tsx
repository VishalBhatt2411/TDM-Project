import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { estimateEmi } from "@/api/vehicles";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function EmiCalculator({ vehiclePrice }: { vehiclePrice: number }) {
  const [downPayment, setDownPayment] = React.useState(Math.round(vehiclePrice * 0.2));
  const [tenureMonths, setTenureMonths] = React.useState(60);
  const [interestRate, setInterestRate] = React.useState(9.5);

  const { data } = useQuery({
    queryKey: ["emi", vehiclePrice, downPayment, tenureMonths, interestRate],
    queryFn: () => estimateEmi({ price: vehiclePrice, downPayment, tenureMonths, annualInterestRate: interestRate }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">EMI Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="downPayment">Down Payment</Label>
            <Input
              id="downPayment"
              type="number"
              value={downPayment}
              onChange={(e) => setDownPayment(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenure">Tenure (months)</Label>
            <Input id="tenure" type="number" value={tenureMonths} onChange={(e) => setTenureMonths(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate">Interest Rate (% p.a.)</Label>
            <Input id="rate" type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} />
          </div>
        </div>
        {data && (
          <div className="grid grid-cols-1 gap-3 rounded-md bg-muted p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Monthly EMI</p>
              <p className="text-lg font-bold text-foreground">{formatInr(data.monthlyPayment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Interest</p>
              <p className="text-lg font-semibold">{formatInr(data.totalInterest)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Payment</p>
              <p className="text-lg font-semibold">{formatInr(data.totalPayment)}</p>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Illustrative estimate only — actual rates and eligibility depend on your lender and credit profile.
        </p>
      </CardContent>
    </Card>
  );
}
