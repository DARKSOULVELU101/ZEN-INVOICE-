export const TENANT_MODELS = [
  "OrganizationSetting", "Branch", "OrganizationMembership", "Role",
  "UserPermissionOverride", "Customer", "CustomerAddress", "Product", "Tax",
  "NumberSequence", "Invoice", "InvoiceItem", "InvoiceItemTax", "InvoiceRevision",
  "InvoiceEvent", "Payment", "PaymentApplication", "AuditLog", "Attachment",
  "EmailOutbox", "BankAccount", "BankTransaction", "Warehouse", "InventoryMovement",
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

const tenantModelSet = new Set<string>(TENANT_MODELS);

export function isTenantModel(model: string): model is TenantModel {
  return tenantModelSet.has(model);
}
