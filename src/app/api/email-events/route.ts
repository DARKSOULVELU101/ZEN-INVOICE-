import { AuditAction, EmailDeliveryStatus, EntityType, InvoiceEventType, OutboxStatus, Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  isTrustedSnsCertificateUrl,
  verifySnsEnvelope,
} from "@/features/email/server/sns";

export const dynamic = "force-dynamic";

const snsSchema = z.object({
  Type: z.literal("Notification"),
  MessageId: z.string().min(1),
  TopicArn: z.string().min(1),
  Message: z.string().min(1),
  Timestamp: z.string().min(1),
  Signature: z.string().min(1),
  SignatureVersion: z.literal("1"),
  SigningCertURL: z.string().min(1),
});

const eventSchema = z.object({
  provider: z.literal("SES"),
  eventId: z.string().min(1),
  eventType: z.enum(["Delivery", "Bounce", "Complaint"]),
  messageId: z.string().min(1),
  recipients: z.array(z.string()).default([]),
  timestamp: z.string().optional(),
  reason: z.string().optional(),
  sns: snsSchema,
});

function requireToken(request: Request): boolean {
  const expected = process.env.EMAIL_EVENT_WEBHOOK_TOKEN;
  const actual = request.headers.get("x-email-event-token");
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  if (!requireToken(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
  }
  const event = parsed.data;

  if (!isTrustedSnsCertificateUrl(event.sns.SigningCertURL)) {
    return NextResponse.json({ error: "Invalid SNS signing certificate." }, { status: 400 });
  }
  if (event.sns.MessageId !== event.eventId) {
    return NextResponse.json({ error: "SNS event identifier mismatch." }, { status: 400 });
  }

  const certificateResponse = await fetch(event.sns.SigningCertURL, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!certificateResponse.ok) {
    return NextResponse.json({ error: "Could not load SNS signing certificate." }, { status: 400 });
  }
  if (!verifySnsEnvelope(
    event.sns,
    await certificateResponse.text(),
    process.env.SES_SNS_TOPIC_ARN ?? "",
  )) {
    return NextResponse.json({ error: "Invalid SNS signature or topic." }, { status: 401 });
  }

  const outboxes = await prisma.emailOutbox.findMany({
    where: { provider: "SES", providerMessageId: event.messageId },
    select: { id: true, organizationId: true, invoiceId: true },
  });
  if (!outboxes.length) {
    return NextResponse.json({ status: "ignored" });
  }

  const duplicate = await prisma.auditLog.findFirst({
    where: {
      organizationId: { in: [...new Set(outboxes.map((entry) => entry.organizationId))] },
      correlationId: event.eventId,
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ status: "duplicate" });
  }

  const failed = event.eventType === "Bounce" || event.eventType === "Complaint";
  const detail = failed
    ? `Email ${event.eventType.toLowerCase()}${event.reason ? `: ${event.reason}` : ""}`
    : "Email delivered";
  const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date();
  let duplicateInTransaction = false;

  try {
    await prisma.$transaction(async (tx) => {
      const prior = await tx.auditLog.findFirst({
        where: {
          organizationId: { in: [...new Set(outboxes.map((entry) => entry.organizationId))] },
          correlationId: event.eventId,
        },
        select: { id: true },
      });
      if (prior) {
        duplicateInTransaction = true;
        return;
      }

      for (const outbox of outboxes) {
        await tx.emailOutbox.update({
          where: { id: outbox.id },
          data: failed
            ? { status: OutboxStatus.FAILED, lastError: detail.slice(0, 500) }
            : { status: OutboxStatus.SENT, sentAt: occurredAt, lastError: null },
        });

        if (!outbox.invoiceId) continue;
        await tx.invoice.update({
          where: { id: outbox.invoiceId },
          data: failed
            ? { emailDeliveryStatus: EmailDeliveryStatus.FAILED, emailLastError: detail.slice(0, 500) }
            : {
                emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
                emailDeliveredAt: occurredAt,
                emailLastError: null,
              },
        });
        await tx.invoiceEvent.create({
          data: {
            organizationId: outbox.organizationId,
            invoiceId: outbox.invoiceId,
            type: failed ? InvoiceEventType.EMAIL_FAILED : InvoiceEventType.SENT,
            message: detail,
            metadata: {
              provider: event.provider,
              eventType: event.eventType,
              messageId: event.messageId,
              recipients: event.recipients,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: outbox.organizationId,
            action: AuditAction.UPDATE,
            entityType: EntityType.INVOICE,
            entityId: outbox.invoiceId,
            after: { emailDeliveryStatus: failed ? "FAILED" : "DELIVERED" } as Prisma.InputJsonValue,
            correlationId: event.eventId,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ status: "duplicate" });
    }
    throw error;
  }

  return NextResponse.json({ status: duplicateInTransaction ? "duplicate" : "accepted" });
}
