export const APP = {
  name: "Zenbook ERP",
  defaultLocale: "en-US",
  defaultTimezone: "UTC",
  defaultCurrency: "USD",
  defaultInvoiceDueDays: 30,
  defaultInvoicePrefix: "INV",
  defaultPaymentPrefix: "PAY",
  maxPageSize: 100,
  defaultPageSize: 25,
  maxLineItems: 200,
  maxStringLength: 2000,
  searchDebounceMs: 300,
} as const;

export const ROUTES = {
  invoices: "/invoices",
  invoiceNew: "/invoices/new",
  invoiceDetail: (id: string) => `/invoices/${id}`,
  invoiceEdit: (id: string) => `/invoices/${id}/edit`,
} as const;
