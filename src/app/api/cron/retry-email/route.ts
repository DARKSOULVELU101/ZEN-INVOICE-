import { AuditAction, EmailDeliveryStatus, EntityType, InvoiceEventType, OutboxStatus, Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { loadEmailConfig } from "@/features/email/server/config";
import { createEmailProvider } from "@/features/email/server/providers";

export const dynamic = "force-dynamic";

function requireToken(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("x-cron-secret");
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  if (!requireToken(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let config;
  let provider;
  try {
    config = loadEmailConfig();
    provider = createEmailProvider(config);
  } catch {
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
  }

  const maxAttempts = Number(process.env.EMAIL_RETRY_MAX_ATTEMPTS ?? "5");
  const limit = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5;
  const now = new Date();
  const outboxes = await prisma.emailOutbox.findMany({
    where: {
      status: { in: [OutboxStatus.FAILED, OutboxStatus.PROCESSING] },
      nextAttemptAt: { lte: now },
      attempts: { lt: limit },
      purpose: "INVOICE_SEND",
    },
    select: {
      id: true,
      organizationId: true,
      invoiceId: true,
      toAddress: true,
      ccAddresses: true,
      bccAddresses: true,
      replyTo: true,
      subject: true,
      bodyText: true,
      bodyHtml: true,
      attachmentName: true,
      attachmentMimeType: true,
      attachmentData: true,
      idempotencyKey: true,
      provider: true,
      providerMessageId: true,
      attempts: true,
    },
    take: 20,
  });

  let reconciled = 0;
  let delivered = 0;
  let failed = 0;

  for (const outbox of outboxes) {
    if (outbox.providerMessageId) {
      await prisma.$transaction(async (tx) => {
        await tx.emailOutbox.update({
          where: { id: outbox.id },
          data: { status: OutboxStatus.SENT, sentAt: now, lastError: null },
        });
        if (outbox.invoiceId) {
          await tx.invoice.update({
            where: { id: outbox.invoiceId },
            data: {
              emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
              emailDeliveredAt: now,
              emailLastError: null,
            },
          });
        }
      });
      reconciled += 1;
      continue;
    }

    if (!outbox.attachmentData || !outbox.invoiceId) {
      failed += 1;
      continue;
    }

    const sender = config.provider === "EMAIL_API" ? "email-api" : config.from;
    try {
      const result = await provider.send({
        from: sender,
        to: [outbox.toAddress],
        cc: outbox.ccAddresses,
        bcc: outbox.bccAddresses,
        ...(outbox.replyTo ? { replyTo: outbox.replyTo } : {}),
        subject: outbox.subject,
        text: outbox.bodyText ?? "",
        html: outbox.bodyHtml ?? "",
        attachments: [{
          filename: outbox.attachmentName ?? "invoice.pdf",
          contentType: outbox.attachmentMimeType ?? "application/pdf",
          content: Buffer.from(outbox.attachmentData),
        }],
        idempotencyKey: outbox.idempotencyKey,
      });

      await prisma.$transaction(async (tx) => {
        await tx.emailOutbox.update({
          where: { id: outbox.id },
          data: {
            status: OutboxStatus.SENT,
            provider: provider.name,
            providerMessageId: result.providerMessageId,
            sentAt: now,
            nextAttemptAt: now,
            lastError: null,
          },
        });
        await tx.invoice.update({
          where: { id: outbox.invoiceId! },
          data: {
            emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
            emailDeliveredAt: now,
            emailLastError: null,
          },
        });
        await tx.invoiceEvent.create({
          data: {
            organizationId: outbox.organizationId,
            invoiceId: outbox.invoiceId!,
            type: InvoiceEventType.SENT,
            message: "Invoice email delivered by retry worker",
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: outbox.organizationId,
            action: AuditAction.SEND,
            entityType: EntityType.INVOICE,
            entityId: outbox.invoiceId!,
            correlationId: result.providerMessageId,
          },
        });
      });
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Retry failed.";
      const attempts = outbox.attempts + 1;
      const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
      await prisma.emailOutbox.update({
        where: { id: outbox.id },
        data: {
          status: attempts >= limit ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          attempts,
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
        },
      });
      await prisma.invoiceEvent.create({
        data: {
          organizationId: outbox.organizationId,
          invoiceId: outbox.invoiceId!,
          actorId: null,
          type: InvoiceEventType.EMAIL_FAILED,
          message: "Invoice email retry failed",
          metadata: { reason: message } as Prisma.InputJsonValue,
        },
      });
      failed += 1;
    }
  }

  return NextResponse.json({ processed: outboxes.length, reconciled, delivered, failed });
}
