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

function calendarDateInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDateToUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addCalendarDays(value: string, days: number): Date {
  const date = calendarDateToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production. Use db:seed:admin instead.");
  }

  await prisma.organization.upsert({
    where: { id: ORGANIZATION_ID },
    create: {
      id: ORGANIZATION_ID,
      name: "Zenbook Demo Co.",
      slug: "zenbook-demo",
      legalName: "Zenbook Demo Co. Pty Ltd",
      baseCurrencyCode: "INR",
      gstin: "27AABCZ1234M1Z5",
      stateCode: "MH",
    },
    update: { baseCurrencyCode: "INR", gstin: "27AABCZ1234M1Z5", stateCode: "MH" },
  });

  await prisma.organizationSetting.upsert({
    where: { organizationId: ORGANIZATION_ID },
    create: {
      organizationId: ORGANIZATION_ID,
      defaultCurrencyCode: "INR",
      invoicePrefix: "INV",
      invoiceDueDays: 30,
      invoiceTerms: "Payment due within 30 days.",
    },
    update: { defaultCurrencyCode: "INR" },
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
      displayName: "Acme Industries", email: "accounts@acme.example", currencyCode: "INR",
      stateCode: "MH", gstin: "27AACCA1234M1Z5",
    },
    update: { currencyCode: "INR", stateCode: "MH", gstin: "27AACCA1234M1Z5" },
  });
  await prisma.customer.upsert({
    where: { id: CUSTOMER_B },
    create: {
      id: CUSTOMER_B, organizationId: ORGANIZATION_ID, customerNumber: "CUST-0002",
      displayName: "Northwind Studio", email: "billing@northwind.example", currencyCode: "INR",
      stateCode: "KA", gstin: "29AABCN1234M1Z5",
    },
    update: { currencyCode: "INR", stateCode: "KA", gstin: "29AABCN1234M1Z5" },
  });

  await prisma.product.upsert({
    where: { id: PRODUCT_A },
    create: {
      id: PRODUCT_A, organizationId: ORGANIZATION_ID, sku: "SVC-CONSULT",
      name: "Consulting services", description: "Senior engineering consulting",
      type: "SERVICE", salePrice: 150, currencyCode: "INR", hsnSac: "998314",
    },
    update: { salePrice: 150, currencyCode: "INR", hsnSac: "998314" },
  });
  await prisma.product.upsert({
    where: { id: PRODUCT_B },
    create: {
      id: PRODUCT_B, organizationId: ORGANIZATION_ID, sku: "SVC-DESIGN",
      name: "Design workshop", description: "Product design workshop",
      type: "SERVICE", salePrice: 900, currencyCode: "INR", hsnSac: "998311",
    },
    update: { salePrice: 900, currencyCode: "INR", hsnSac: "998311" },
  });

  await prisma.tax.upsert({
    where: { id: TAX_GST },
    create: {
      id: TAX_GST, organizationId: ORGANIZATION_ID, name: "GST 18%",
      rate: 18, type: "GST", component: "GST", jurisdiction: "DEFAULT",
    },
    update: { rate: 18, type: "GST", component: "GST" },
  });
  await prisma.tax.upsert({
    where: { id: TAX_VAT },
    create: {
      id: TAX_VAT, organizationId: ORGANIZATION_ID, name: "VAT",
      rate: 20, type: "VAT", jurisdiction: "DEFAULT", isCompound: false,
    },
    update: {},
  });

  const rateDate = new Date(new Date().toISOString().slice(0, 10));
  const exchangeRates = [
    { from: "INR", to: "USD", rate: 0.012 },
    { from: "USD", to: "INR", rate: 83.3333 },
    { from: "INR", to: "EUR", rate: 0.011 },
    { from: "EUR", to: "INR", rate: 90.9091 },
    { from: "INR", to: "GBP", rate: 0.0095 },
    { from: "GBP", to: "INR", rate: 105.2632 },
    { from: "INR", to: "AED", rate: 0.044 },
    { from: "AED", to: "INR", rate: 22.7273 },
  ] as const;
  for (const item of exchangeRates) {
    await prisma.exchangeRate.upsert({
      where: {
        organizationId_fromCurrencyCode_toCurrencyCode_rateDate: {
          organizationId: ORGANIZATION_ID,
          fromCurrencyCode: item.from,
          toCurrencyCode: item.to,
          rateDate,
        },
      },
      create: {
        organizationId: ORGANIZATION_ID,
        fromCurrencyCode: item.from,
        toCurrencyCode: item.to,
        rate: item.rate,
        rateDate,
        source: "SEED",
      },
      update: { rate: item.rate, source: "SEED" },
    });
  }

  const today = calendarDateInKolkata();
  const now = calendarDateToUtcDate(today);
  const due = addCalendarDays(today, 30);
  const pastIssue = addCalendarDays(today, -40);
  const pastDue = addCalendarDays(today, -10);

  const invoices = [
    {
      id: INVOICE_DRAFT, number: "INV-26-00001", customerId: CUSTOMER_A, customerStateCode: "MH",
      status: "DRAFT" as const, total: 1770, balanceDue: 1770,
      invoiceDate: now, issueDate: now, paymentTerms: 30, dueDate: due,
      description: "Consulting services", quantity: 10, unitPrice: 150, taxId: TAX_GST, taxAmount: 270,
      cgstAmount: 135, sgstAmount: 135, igstAmount: 0,
    },
    {
      id: INVOICE_SENT, number: "INV-26-00002", customerId: CUSTOMER_B, customerStateCode: "KA",
      status: "SENT" as const, total: 1062, balanceDue: 1062,
      invoiceDate: pastIssue, issueDate: pastIssue, paymentTerms: 30, dueDate: pastDue,
      description: "Design workshop", quantity: 1, unitPrice: 900, taxId: TAX_GST, taxAmount: 162,
      cgstAmount: 0, sgstAmount: 0, igstAmount: 162,
    },
    {
      id: INVOICE_PARTIAL, number: "INV-26-00003", customerId: CUSTOMER_A, customerStateCode: "MH",
      status: "PARTIALLY_PAID" as const, total: 2360, balanceDue: 1360,
      invoiceDate: now, issueDate: now, paymentTerms: 30, dueDate: due,
      description: "Consulting services", quantity: 20, unitPrice: 100, taxId: TAX_GST, taxAmount: 360,
      cgstAmount: 180, sgstAmount: 180, igstAmount: 0,
    },
    {
      id: INVOICE_PAID, number: "INV-26-00004", customerId: CUSTOMER_B, customerStateCode: "KA",
      status: "PAID" as const, total: 1180, balanceDue: 0,
      invoiceDate: now, issueDate: now, paymentTerms: 30, dueDate: due,
      description: "Design workshop", quantity: 1, unitPrice: 1000, taxId: TAX_GST, taxAmount: 180,
      cgstAmount: 0, sgstAmount: 0, igstAmount: 180,
    },
  ];

  for (const invoice of invoices) {
    const existing = await prisma.invoice.findFirst({
      where: { organizationId: ORGANIZATION_ID, invoiceNumber: invoice.number },
    });
    if (existing) {
      await prisma.invoice.update({
        where: { id: existing.id },
        data: {
          invoiceDate: invoice.invoiceDate,
          issueDate: invoice.issueDate,
          paymentTerms: invoice.paymentTerms,
          dueDate: invoice.dueDate,
        },
      });
      await prisma.invoiceItem.updateMany({
        where: { invoiceId: existing.id, productId: null },
        data: { productId: invoice.customerId === CUSTOMER_A ? PRODUCT_A : PRODUCT_B },
      });
      continue;
    }

    await prisma.invoice.create({
      data: {
        id: invoice.id,
        organizationId: ORGANIZATION_ID,
        customerId: invoice.customerId,
        invoiceNumber: invoice.number,
        status: invoice.status,
        currencyCode: "INR",
        baseCurrencyCode: "INR",
        exchangeRate: 1,
        gstin: "27AABCZ1234M1Z5",
        sourceStateCode: "MH",
        destinationStateCode: invoice.customerStateCode,
        invoiceDate: invoice.invoiceDate,
        issueDate: invoice.issueDate,
        paymentTerms: invoice.paymentTerms,
        dueDate: invoice.dueDate,
        subtotal: invoice.total - invoice.taxAmount,
        discountAmount: 0,
        taxableAmount: invoice.total - invoice.taxAmount,
        cgstAmount: invoice.cgstAmount,
        sgstAmount: invoice.sgstAmount,
        igstAmount: invoice.igstAmount,
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
            productId: invoice.customerId === CUSTOMER_A ? PRODUCT_A : PRODUCT_B,
            description: invoice.description,
            quantity: invoice.quantity,
            unitPrice: invoice.unitPrice,
            taxableAmount: invoice.total - invoice.taxAmount,
            cgstAmount: invoice.cgstAmount,
            sgstAmount: invoice.sgstAmount,
            igstAmount: invoice.igstAmount,
            amount: invoice.total,
            taxAmount: invoice.taxAmount,
            taxes: {
              create: {
                organizationId: ORGANIZATION_ID,
                taxId: invoice.taxId,
                nameSnapshot: "GST 18%",
                component: invoice.igstAmount > 0 ? "IGST" : "GST",
                rateSnapshot: 18,
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

  const paymentSeeds = [
    { paymentNumber: "PAY-26-00001", invoiceId: INVOICE_PARTIAL, customerId: CUSTOMER_A },
    { paymentNumber: "PAY-26-00002", invoiceId: INVOICE_PAID, customerId: CUSTOMER_B },
  ];
  for (const paymentSeed of paymentSeeds) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: paymentSeed.invoiceId },
      select: { amountPaid: true, issueDate: true },
    });
    if (!invoice || invoice.amountPaid.lte(0)) continue;

    let payment = await prisma.payment.findFirst({
      where: { organizationId: ORGANIZATION_ID, paymentNumber: paymentSeed.paymentNumber },
      select: { id: true },
    });
    if (!payment) {
      payment = await prisma.payment.create({
        data: {
          organizationId: ORGANIZATION_ID,
          customerId: paymentSeed.customerId,
          invoiceId: paymentSeed.invoiceId,
          paymentNumber: paymentSeed.paymentNumber,
          amount: invoice.amountPaid,
          unappliedAmount: 0,
          currencyCode: "INR",
          baseCurrencyCode: "INR",
          exchangeRate: 1,
          amountInBaseCurrency: invoice.amountPaid,
          paidAt: invoice.issueDate,
          method: "BANK_TRANSFER",
          status: "COMPLETED",
          createdById: USER_ID,
        },
        select: { id: true },
      });
    }

    const application = await prisma.paymentApplication.findUnique({
      where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: paymentSeed.invoiceId } },
      select: { id: true },
    });
    if (!application) {
      await prisma.paymentApplication.create({
        data: {
          organizationId: ORGANIZATION_ID,
          paymentId: payment.id,
          invoiceId: paymentSeed.invoiceId,
          amount: invoice.amountPaid,
        },
      });
    }
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

  await prisma.numberSequence.upsert({
    where: {
      organizationId_documentType_period_scopeKey: {
        organizationId: ORGANIZATION_ID,
        documentType: "PAYMENT",
        period: new Date().getUTCFullYear(),
        scopeKey: "DEFAULT",
      },
    },
    create: {
      organizationId: ORGANIZATION_ID,
      documentType: "PAYMENT",
      period: new Date().getUTCFullYear(),
      scopeKey: "DEFAULT",
      prefix: "PAY",
      nextNumber: 2,
    },
    update: {},
  });

  console.log("Seed complete: organization, user, customers, products, taxes, rates and four invoices.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
