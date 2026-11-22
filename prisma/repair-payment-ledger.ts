import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      amountPaid: { gt: 0 },
      applications: { none: {} },
    },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      invoiceNumber: true,
      currencyCode: true,
      baseCurrencyCode: true,
      exchangeRate: true,
      issueDate: true,
      createdById: true,
      amountPaid: true,
    },
  });

  let repaired = 0;
  for (const invoice of invoices) {
    const paymentNumber = `PAY-LEDGER-${invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
    await prisma.$transaction(async (tx) => {
      let payment = await tx.payment.findFirst({
        where: { organizationId: invoice.organizationId, paymentNumber },
        select: { id: true },
      });
      if (!payment) {
        payment = await tx.payment.create({
          data: {
            organizationId: invoice.organizationId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            paymentNumber,
            amount: invoice.amountPaid,
            unappliedAmount: 0,
            currencyCode: invoice.currencyCode,
            baseCurrencyCode: invoice.baseCurrencyCode,
            exchangeRate: invoice.exchangeRate,
            amountInBaseCurrency: invoice.amountPaid.mul(invoice.exchangeRate),
            paidAt: invoice.issueDate,
            method: "BANK_TRANSFER",
            status: "COMPLETED",
            createdById: invoice.createdById,
          },
          select: { id: true },
        });
      }
      const existing = await tx.paymentApplication.findUnique({
        where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: invoice.id } },
        select: { id: true },
      });
      if (!existing) {
        await tx.paymentApplication.create({
          data: {
            organizationId: invoice.organizationId,
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: invoice.amountPaid,
          },
        });
      }
    });
    repaired += 1;
  }

  console.log(JSON.stringify({ repaired }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
