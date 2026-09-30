import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, onCheckedChange, disabled, id, ...props }, ref) => (
    <button
      ref={ref}
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary text-primary-foreground" : "bg-background",
      )}
      {...props}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  ),
);
Checkbox.displayName = "Checkbox";
