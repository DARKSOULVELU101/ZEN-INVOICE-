import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORGANIZATION_ID = process.env.DEMO_ORGANIZATION_ID ?? "00000000-0000-4000-8000-000000000001";
const USER_ID = process.env.DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001";
const CUSTOMER_A = "10000000-0000-4000-8000-000000000001";
const CUSTOMER_B = "10000000-0000-4000-8000-000000000002";
const PRODUCT_A = "20000000-0000-4000-8000-000000000001";
const PRODUCT_B = "20000000-0000-4000-8000-000000000002";
const TAX_GST = "30000000-0000-4000-8000-000000000001";
const TAX_VAT = "30000000-0000-4000-8000-000000000002";
const INVOICE_DRAFT = "40000000-0000-4000-8000-000000000001";
const INVOICE_SENT = "40000000-0000-4000-8000-000000000002";
const INVOICE_PARTIAL = "40000000-0000-4000-8000-000000000003";
const INVOICE_PAID = "40000000-0000-4000-8000-000000000004";

async function main() {
  await prisma.organization.upsert({
    where: { id: ORGANIZATION_ID },
    create: {
      id: ORGANIZATION_ID,
      name: "Zenbook Demo Co.",
      slug: "zenbook-demo",
      legalName: "Zenbook Demo Co. Pty Ltd",
      baseCurrencyCode: "USD",
    },
    update: {},
  });

  await prisma.organizationSetting.upsert({
    where: { organizationId: ORGANIZATION_ID },
    create: {
      organizationId: ORGANIZATION_ID,
      defaultCurrencyCode: "USD",
      invoicePrefix: "INV",
      invoiceDueDays: 30,
      invoiceTerms: "Payment due within 30 days.",
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      email: "admin@zenbook.demo",
      name: "Demo Admin",
    },
    update: {},
  });

  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: ORGANIZATION_ID, userId: USER_ID } },
    create: { organizationId: ORGANIZATION_ID, userId: USER_ID, status: "ACTIVE", title: "Administrator" },
    update: {},
  });

  const role = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: ORGANIZATION_ID, key: "ADMIN" } },
    create: { organizationId: ORGANIZATION_ID, key: "ADMIN", name: "Administrator", isSystem: true },
    update: {},
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
    create: { membershipId: membership.id, roleId: role.id },
    update: {},
  });

  const permissions = [
    "invoice:view", "invoice:create", "invoice:edit", "invoice:delete", "invoice:approve",
    "invoice:send", "invoice:cancel", "payment:record", "customer:view", "customer:create",
    "customer:edit", "product:view", "product:create", "product:edit", "report:view", "audit:view",
  ];
  for (const key of permissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      create: { key, module: key.split(":")[0] ?? "general" },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  }

  await prisma.customer.upsert({
    where: { id: CUSTOMER_A },
    create: {
      id: CUSTOMER_A, organizationId: ORGANIZATION_ID, customerNumber: "CUST-0001",
      displayName: "Acme Industries", email: "accounts@acme.example", currencyCode: "USD",
    },
    update: {},
  });
  await prisma.customer.upsert({
    where: { id: CUSTOMER_B },
    create: {
      id: CUSTOMER_B, organizationId: ORGANIZATION_ID, customerNumber: "CUST-0002",
      displayName: "Northwind Studio", email: "billing@northwind.example", currencyCode: "USD",
    },
    update: {},
  });

  await prisma.product.upsert({
    where: { id: PRODUCT_A },
    create: {
      id: PRODUCT_A, organizationId: ORGANIZATION_ID, sku: "SVC-CONSULT",
      name: "Consulting services", description: "Senior engineering consulting",
      type: "SERVICE", salePrice: 150, currencyCode: "USD",
    },
    update: {},
  });
  await prisma.product.upsert({
    where: { id: PRODUCT_B },
    create: {
      id: PRODUCT_B, organizationId: ORGANIZATION_ID, sku: "SVC-DESIGN",
      name: "Design workshop", description: "Product design workshop",
      type: "SERVICE", salePrice: 900, currencyCode: "USD",
    },
    update: {},
  });

  await prisma.tax.upsert({
    where: { id: TAX_GST },
    create: {
      id: TAX_GST, organizationId: ORGANIZATION_ID, name: "Sales tax",
      rate: 10, type: "SALES_TAX", jurisdiction: "DEFAULT",
    },
    update: {},
  });
  await prisma.tax.upsert({
    where: { id: TAX_VAT },
    create: {
      id: TAX_VAT, organizationId: ORGANIZATION_ID, name: "VAT",
      rate: 20, type: "VAT", jurisdiction: "DEFAULT", isCompound: false,
    },
    update: {},
  });

  const now = new Date();
  const due = new Date(now.getTime() + 30 * 86_400_000);
  const pastDue = new Date(now.getTime() - 10 * 86_400_000);

  const invoices = [
    {
      id: INVOICE_DRAFT, number: "INV-26-00001", customerId: CUSTOMER_A,
      status: "DRAFT" as const, total: 1650, balanceDue: 1650, dueDate: due,
      description: "Consulting services", quantity: 10, unitPrice: 150, taxId: TAX_GST, taxAmount: 150,
    },
    {
      id: INVOICE_SENT, number: "INV-26-00002", customerId: CUSTOMER_B,
      status: "SENT" as const, total: 990, balanceDue: 990, dueDate: pastDue,
      description: "Design workshop", quantity: 1, unitPrice: 900, taxId: TAX_GST, taxAmount: 90,
    },
    {
      id: INVOICE_PARTIAL, number: "INV-26-00003", customerId: CUSTOMER_A,
      status: "PARTIALLY_PAID" as const, total: 2200, balanceDue: 1200, dueDate: due,
      description: "Consulting services", quantity: 20, unitPrice: 100, taxId: TAX_GST, taxAmount: 200,
    },
    {
      id: INVOICE_PAID, number: "INV-26-00004", customerId: CUSTOMER_B,
      status: "PAID" as const, total: 1100, balanceDue: 0, dueDate: due,
      description: "Design workshop", quantity: 1, unitPrice: 1000, taxId: TAX_GST, taxAmount: 100,
    },
  ];

  for (const invoice of invoices) {
    const existing = await prisma.invoice.findFirst({
      where: { organizationId: ORGANIZATION_ID, invoiceNumber: invoice.number },
    });
    if (existing) continue;

    await prisma.invoice.create({
      data: {
        id: invoice.id,
        organizationId: ORGANIZATION_ID,
        customerId: invoice.customerId,
        invoiceNumber: invoice.number,
        status: invoice.status,
        currencyCode: "USD",
        baseCurrencyCode: "USD",
        exchangeRate: 1,
        issueDate: now,
        dueDate: invoice.dueDate,
        subtotal: invoice.total - invoice.taxAmount,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        amountPaid: invoice.total - invoice.balanceDue,
        balanceDue: invoice.balanceDue,
        createdById: USER_ID,
        sentAt: invoice.status === "DRAFT" ? null : now,
        items: {
          create: {
            organizationId: ORGANIZATION_ID,
            position: 1,
            description: invoice.description,
            quantity: invoice.quantity,
            unitPrice: invoice.unitPrice,
            amount: invoice.total - invoice.taxAmount,
            taxAmount: invoice.taxAmount,
            taxes: {
              create: {
                organizationId: ORGANIZATION_ID,
                taxId: invoice.taxId,
                nameSnapshot: "Sales tax",
                rateSnapshot: 10,
                amount: invoice.taxAmount,
              },
            },
          },
        },
        events: {
          create: {
            organizationId: ORGANIZATION_ID,
            type: "CREATED",
            actorId: USER_ID,
          },
        },
      },
    });
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { organizationId: ORGANIZATION_ID, paymentNumber: "PAY-26-00001" },
  });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        organizationId: ORGANIZATION_ID,
        customerId: CUSTOMER_A,
        paymentNumber: "PAY-26-00001",
        amount: 1000,
        unappliedAmount: 0,
        currencyCode: "USD",
        paidAt: now,
        method: "BANK_TRANSFER",
        status: "COMPLETED",
        createdById: USER_ID,
        applications: {
          create: { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_PARTIAL, amount: 1000 },
        },
      },
    });
  }

  await prisma.numberSequence.upsert({
    where: {
      organizationId_documentType_period_scopeKey: {
        organizationId: ORGANIZATION_ID,
        documentType: "INVOICE",
        period: new Date().getUTCFullYear(),
        scopeKey: "DEFAULT",
      },
    },
    create: {
      organizationId: ORGANIZATION_ID,
      documentType: "INVOICE",
      period: new Date().getUTCFullYear(),
      scopeKey: "DEFAULT",
      prefix: "INV",
      nextNumber: 5,
    },
    update: {},
  });

  console.log("Seed complete: organization, user, customers, products, taxes and four invoices.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
