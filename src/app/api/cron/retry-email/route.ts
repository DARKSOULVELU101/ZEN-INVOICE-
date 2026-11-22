import { AuditAction, EmailDeliveryStatus, EntityType, InvoiceEventType, OutboxStatus, Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { loadEmailConfig } from "@/features/email/server/config";
import { canReconcileEmailAsDelivered } from "@/features/email/domain/outbox";
import { createEmailProvider } from "@/features/email/server/providers";

export const dynamic = "force-dynamic";

function matchesSecret(actual: string | null, expected: string | undefined): boolean {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function requireToken(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  return matchesSecret(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)
    || matchesSecret(bearer, process.env.CRON_SECRET);
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
      providerMessageId: true,
      lastError: true,
      attempts: true,
      invoice: { select: { emailLastError: true } },
    },
    take: 20,
  });

  let reconciled = 0;
  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;

  const markDeadLetter = async (outbox: (typeof outboxes)[number], reason: string) => {
    await prisma.$transaction(async (tx) => {
      await tx.emailOutbox.update({
        where: { id: outbox.id },
        data: {
          status: OutboxStatus.DEAD_LETTER,
          attempts: outbox.attempts,
          lastError: reason.slice(0, 500),
          nextAttemptAt: now,
          lockedAt: null,
        },
      });
      if (outbox.invoiceId) {
        await tx.invoice.update({
          where: { id: outbox.invoiceId },
          data: {
            emailDeliveryStatus: EmailDeliveryStatus.FAILED,
            emailLastError: reason.slice(0, 500),
          },
        });
        await tx.invoiceEvent.create({
          data: {
            organizationId: outbox.organizationId,
            invoiceId: outbox.invoiceId,
            type: InvoiceEventType.EMAIL_FAILED,
            message: "Invoice email retry exhausted",
            metadata: { reason } as Prisma.InputJsonValue,
          },
        });
      }
    });
  };

  for (const outbox of outboxes) {
    const claimed = await prisma.emailOutbox.updateMany({
      where: { id: outbox.id, lockedAt: null },
      data: { lockedAt: now },
    });
    if (claimed.count !== 1) continue;

    try {
      if (outbox.providerMessageId) {
        if (!canReconcileEmailAsDelivered({
          providerMessageId: outbox.providerMessageId,
          lastError: outbox.lastError,
          invoiceLastError: outbox.invoice?.emailLastError,
        })) {
          await markDeadLetter(outbox, "Email was rejected or bounced after provider acceptance.");
          deadLettered += 1;
          continue;
        }
        await prisma.$transaction(async (tx) => {
          await tx.emailOutbox.update({
            where: { id: outbox.id },
            data: {
              status: OutboxStatus.SENT,
              sentAt: now,
              lastError: null,
              lockedAt: null,
            },
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

      if (!outbox.attachmentData || !outbox.invoiceId || outbox.attempts >= limit) {
        await markDeadLetter(outbox, "Email retry cannot recover this message without regenerating the invoice PDF.");
        deadLettered += 1;
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
              lockedAt: null,
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
            status: attempts >= limit ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
            attempts,
            lastError: message,
            nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
            lockedAt: null,
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
    } finally {
      await prisma.emailOutbox.updateMany({
        where: { id: outbox.id, lockedAt: now },
        data: { lockedAt: null },
      });
    }
  }

  return NextResponse.json({ processed: outboxes.length, reconciled, delivered, failed, deadLettered });
}
