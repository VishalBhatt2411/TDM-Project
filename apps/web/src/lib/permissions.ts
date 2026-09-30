/** Display order doubles as seniority — the sidebar shows a user's most senior role. */
export const STAFF_ROLE_OPTIONS = [
  { key: "Company_Admin", label: "Company Admin", description: "Everything, at every dealership." },
  { key: "Dealer_Admin", label: "Dealer Admin", description: "Staff, test drives, dashboard, inventory, branches and site settings at one dealership." },
  { key: "Manager", label: "Manager", description: "Test drives and dashboard at one dealership." },
  { key: "Sales_Rep", label: "Sales Rep", description: "Their own assigned test drives at one branch." },
] as const;

export function staffRoleLabel(role: string): string {
  return STAFF_ROLE_OPTIONS.find((r) => r.key === role)?.label ?? role;
}
