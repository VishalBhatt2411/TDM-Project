import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { estimateEmi } from "@/api/vehicles";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const TENURE_MIN = 6;
const TENURE_MAX = 84;
const RATE_MIN = 1;
const RATE_MAX = 20;
const DOWN_PAYMENT_PRESETS = [10, 20, 30];
const DEBOUNCE_MS = 400;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function EmiCalculator({ vehiclePrice }: { vehiclePrice: number }) {
  const [downPaymentInput, setDownPaymentInput] = React.useState(String(Math.round(vehiclePrice * 0.2)));
  const [tenureInput, setTenureInput] = React.useState("60");
  const [rateInput, setRateInput] = React.useState("9.5");

  const debouncedDownPayment = useDebouncedValue(downPaymentInput, DEBOUNCE_MS);
  const debouncedTenure = useDebouncedValue(tenureInput, DEBOUNCE_MS);
  const debouncedRate = useDebouncedValue(rateInput, DEBOUNCE_MS);

  const downPayment = debouncedDownPayment === "" ? NaN : Number(debouncedDownPayment);
  const tenureMonths = debouncedTenure === "" ? NaN : Number(debouncedTenure);
  const interestRate = debouncedRate === "" ? NaN : Number(debouncedRate);

  const downPaymentError = Number.isNaN(downPayment)
    ? "Enter a down payment amount"
    : downPayment < 0
      ? "Down payment cannot be negative"
      : downPayment >= vehiclePrice
        ? "Down payment must be less than the vehicle price"
        : null;

  const tenureError = Number.isNaN(tenureMonths)
    ? "Enter a loan tenure"
    : tenureMonths < TENURE_MIN || tenureMonths > TENURE_MAX
      ? `Tenure must be between ${TENURE_MIN} and ${TENURE_MAX} months`
      : null;

  const rateError = Number.isNaN(interestRate)
    ? "Enter an interest rate"
    : interestRate < RATE_MIN || interestRate > RATE_MAX
      ? `Rate must be between ${RATE_MIN}% and ${RATE_MAX}%`
      : null;

  const isValid = !downPaymentError && !tenureError && !rateError;

  const { data, isFetching } = useQuery({
    queryKey: ["emi", vehiclePrice, downPayment, tenureMonths, interestRate],
    queryFn: () => estimateEmi({ price: vehiclePrice, downPayment, tenureMonths, annualInterestRate: interestRate }),
    enabled: isValid,
    placeholderData: keepPreviousData,
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
              inputMode="numeric"
              value={downPaymentInput}
              onChange={(e) => setDownPaymentInput(e.target.value)}
              aria-invalid={!!downPaymentError}
            />
            <div className="flex gap-1.5">
              {DOWN_PAYMENT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDownPaymentInput(String(Math.round((vehiclePrice * pct) / 100)))}
                  className="rounded-full border border-input px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {pct}%
                </button>
              ))}
            </div>
            {downPaymentError && <p className="text-xs text-destructive">{downPaymentError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenure">Tenure (months)</Label>
            <Input
              id="tenure"
              type="number"
              inputMode="numeric"
              value={tenureInput}
              onChange={(e) => setTenureInput(e.target.value)}
              aria-invalid={!!tenureError}
            />
            <input
              type="range"
              min={TENURE_MIN}
              max={TENURE_MAX}
              step={6}
              value={Number.isNaN(tenureMonths) ? TENURE_MIN : Math.min(Math.max(tenureMonths, TENURE_MIN), TENURE_MAX)}
              onChange={(e) => setTenureInput(e.target.value)}
              className="w-full accent-primary"
              aria-label="Tenure in months"
            />
            {tenureError && <p className="text-xs text-destructive">{tenureError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate">Interest Rate (% p.a.)</Label>
            <Input
              id="rate"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              aria-invalid={!!rateError}
            />
            {rateError && <p className="text-xs text-destructive">{rateError}</p>}
          </div>
        </div>

        {data && (
          <div
            className={cn(
              "grid grid-cols-1 gap-3 rounded-md bg-muted p-4 transition-opacity duration-150 sm:grid-cols-3",
              isFetching && "opacity-60",
            )}
          >
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

        {!isValid && (
          <p className="text-xs text-muted-foreground">Enter valid values in all fields to see your estimate.</p>
        )}

        <p className="text-xs text-muted-foreground">
          Illustrative estimate only — actual rates and eligibility depend on your lender and credit profile.
        </p>
      </CardContent>
    </Card>
  );
}
