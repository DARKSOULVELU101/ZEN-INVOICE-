import type { PermissionKey } from "@/config/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: "dashboard" | "invoices" | "customers" | "products" | "payments" | "reports";
  permission: PermissionKey | null;
  available: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: null, available: true },
  { label: "Invoices", href: "/invoices", icon: "invoices", permission: "invoice:view", available: true },
  { label: "Customers", href: "/customers", icon: "customers", permission: "customer:view", available: true },
  { label: "Products", href: "/products", icon: "products", permission: "product:view", available: true },
  { label: "Payments", href: "/payments", icon: "payments", permission: "payment:record", available: true },
  { label: "Reports", href: "/reports", icon: "reports", permission: "report:view", available: true },
] as const;
