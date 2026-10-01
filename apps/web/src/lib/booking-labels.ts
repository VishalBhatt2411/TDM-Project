import type { PurchaseTimeline } from "@tdm/types";

export const PURCHASE_TIMELINE_OPTIONS: { value: PurchaseTimeline; label: string }[] = [
  { value: "Immediate", label: "Immediately" },
  { value: "Within_1_Month", label: "Within 1 month" },
  { value: "Within_3_Months", label: "Within 3 months" },
  { value: "Within_6_Months", label: "Within 6 months" },
  { value: "Just_Exploring", label: "Just exploring" },
];

export function purchaseTimelineLabel(value: PurchaseTimeline): string {
  return PURCHASE_TIMELINE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
