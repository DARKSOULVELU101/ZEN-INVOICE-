import { randomUUID } from "node:crypto";
import {
  AuditAction,
  DocumentType,
  EntityType,
  InvoiceEventType,
  OutboxStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type InvoiceStatus as DbInvoiceStatus,
} from "@prisma/client";
import { APP } from "@/config/app";
import { requireSession, type Session } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import {
  ConflictError,
  DomainError,
  ErrorCodes,
  NotFoundError,
  toResultAsync,
  type Result,
} from "@/lib/errors/result";
import { cursorCondition, nextCursor } from "@/lib/query/cursor";
import { assertOwnership, dataScopeFor, requirePermission } from "@/lib/rbac/guard";
import { clampNonNegative, Decimal, roundMoney, roundPercent, toDbDecimal } from "@/lib/money/decimal";
import { calculateInvoiceTotals } from "../domain/totals";
import { displayStatus, isEditable, transition } from "../domain/status";
import type { InvoiceFormOutput, InvoiceListQuery } from "../schemas/invoice";
import type { RecordPaymentInput } from "../schemas/payment";
import type {
  InvoiceDetail,
  InvoiceEventDto,
  InvoiceLineDto,
  InvoiceListItem,
  InvoiceListResult,
  InvoiceLineInput,
} from "../types/invoice";

type Db = Awaited<ReturnType<typeof getTenantDb>>;

const invoiceInclude = {
  customer: { select: { id: true, displayName: true, email: true } },
  items: { include: { taxes: true }, orderBy: { position: "asc" as const } },
  events: {
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
  applications: { include: { payment: true } },
  revisions: { select: { id: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  currencyCode: true,
  subtotal: true,
  taxAmount: true,
  total: true,
  amountPaid: true,
  balanceDue: true,
  createdAt: true,
  version: true,
  customer: { select: { id: true, displayName: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceListRecord = Prisma.InvoiceGetPayload<{ select: typeof invoiceListSelect }>;

function numberString(value: Decimal): string {
  return value.toString();
}

function dateString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapListItem(record: InvoiceListRecord): InvoiceListItem {
  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber,
    status: record.status,
    displayStatus: displayStatus(record.status, record.dueDate, record.balanceDue),
    customerId: record.customer.id,
    customerName: record.customer.displayName,
    issueDate: record.issueDate.toISOString().slice(0, 10),
    dueDate: record.dueDate.toISOString().slice(0, 10),
    currencyCode: record.currencyCode,
    subtotal: numberString(record.subtotal),
    taxAmount: numberString(record.taxAmount),
    total: numberString(record.total),
    amountPaid: numberString(record.amountPaid),
    balanceDue: numberString(record.balanceDue),
    createdAt: record.createdAt.toISOString(),
    version: record.version,
  };
}

function mapLine(line: InvoiceRecord["items"][number]): InvoiceLineDto {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    skuSnapshot: line.skuSnapshot,
    productId: line.productId,
    quantity: numberString(line.quantity),
    unitPrice: numberString(line.unitPrice),
    discountPercent: numberString(line.discountPercent),
    discountAmount: numberString(line.discountAmount),
    taxable: line.taxable,
    taxAmount: numberString(line.taxAmount),
    amount: numberString(line.amount),
    taxes: line.taxes.map((tax) => ({
      id: tax.taxId,
      name: tax.nameSnapshot,
      rate: numberString(tax.rateSnapshot),
      amount: numberString(tax.amount),
    })),
  };
}

function mapDetail(record: InvoiceRecord): InvoiceDetail {
  const payments = record.applications
    .filter((application) => !application.payment.deletedAt)
    .map((application) => ({
      id: application.payment.id,
      paymentNumber: application.payment.paymentNumber,
      amount: numberString(application.amount),
      paidAt: application.payment.paidAt.toISOString().slice(0, 10),
      method: application.payment.method,
      reference: application.payment.reference,
    }));

  const events: InvoiceEventDto[] = record.events.map((event) => ({
    id: event.id,
    type: event.type,
    message: event.message,
    actorName: event.actor?.name ?? null,
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    ...mapListItem(record),
    baseCurrencyCode: record.baseCurrencyCode,
    exchangeRate: numberString(record.exchangeRate),
    reference: record.reference,
    notes: record.notes,
    terms: record.terms,
    footer: record.footer,
    sentAt: dateString(record.sentAt),
    cancelledAt: dateString(record.cancelledAt),
    cancelReason: record.cancelReason,
    branchId: record.branchId,
    customerEmail: record.customer.email,
    items: record.items.map(mapLine),
    events,
    payments,
    revisionCount: record.revisions.length,
  };
}

async function writeAudit(
  db: Db,
  session: Session,
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: session.organizationId,
      actorId: session.user.id,
      action,
      entityType,
      entityId,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      correlationId: randomUUID(),
    },
  });
}

async function writeEvent(
  db: Db,
  session: Session,
  invoiceId: string,
  type: InvoiceEventType,
  message?: string,
): Promise<void> {
  await db.invoiceEvent.create({
    data: {
      organizationId: session.organizationId,
      invoiceId,
      actorId: session.user.id,
      type,
      ...(message ? { message } : {}),
    },
  });
}

function formatNumber(prefix: string, period: number, sequence: number, padding: number, suffix: string) {
  return `${prefix}-${String(period).slice(-2)}-${String(sequence).padStart(padding, "0")}${suffix}`;
}

async function allocateNumber(
  db: Db,
  documentType: DocumentType,
  prefix: string,
  organizationId: string,
): Promise<string> {
  const period = new Date().getUTCFullYear();
  const scopeKey = "DEFAULT";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await db.numberSequence.findFirst({ where: { documentType, period, scopeKey } });

    if (existing) {
      const updated = await db.numberSequence.update({
        where: { id: existing.id },
        data: { nextNumber: { increment: 1 } },
      });
      return formatNumber(existing.prefix, period, updated.nextNumber - 1, existing.padding, existing.suffix);
    }

    try {
      const created = await db.numberSequence.create({
        data: { organizationId, documentType, period, scopeKey, prefix, nextNumber: 2 },
      });
      return formatNumber(created.prefix, period, 1, created.padding, created.suffix);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }

  throw new Error("Unable to allocate a document number after 3 attempts.");
}

async function loadSettings(db: Db, organizationId: string) {
  const settings = await db.organizationSetting.findUnique({ where: { organizationId } });
  return {
    prefix: settings?.invoicePrefix ?? APP.defaultInvoicePrefix,
    dueDays: settings?.invoiceDueDays ?? APP.defaultInvoiceDueDays,
    currency: settings?.defaultCurrencyCode ?? APP.defaultCurrency,
  };
}

interface PreparedLines {
  itemData: Prisma.InvoiceItemUncheckedCreateWithoutInvoiceInput[];
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

async function prepareLines(
  db: Db,
  organizationId: string,
  lines: readonly InvoiceLineInput[],
): Promise<PreparedLines> {
  const taxIds = [...new Set(lines.flatMap((line) => (line.taxIds ?? []).filter(() => line.taxable !== false)))];
  const productIds = [...new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))];

  const [taxes, products] = await Promise.all([
    taxIds.length ? db.tax.findMany({ where: { id: { in: taxIds } } }) : Promise.resolve([]),
    productIds.length ? db.product.findMany({ where: { id: { in: productIds } } }) : Promise.resolve([]),
  ]);

  if (taxes.length !== taxIds.length) {
    throw new DomainError(ErrorCodes.TAX_INVALID, "One or more selected taxes are no longer available.");
  }

  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const taxNameById = new Map(taxes.map((tax) => [tax.id, tax.name]));

  const calculated = calculateInvoiceTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
      taxes:
        line.taxable === false
          ? []
          : (line.taxIds ?? []).map((id) => {
              const tax = taxById.get(id);
              if (!tax) throw new DomainError(ErrorCodes.TAX_INVALID, "Unknown tax selected.");
              return { rate: tax.rate.toString(), isCompound: tax.isCompound };
            }),
    })),
  );

  const itemData = lines.map((line, index): Prisma.InvoiceItemUncheckedCreateWithoutInvoiceInput => {
    const totals = calculated.lines[index];
    if (!totals) throw new Error("Totals calculation did not produce a line result.");
    const product = line.productId ? productById.get(line.productId) : undefined;
    const lineTaxes = line.taxable === false
      ? []
      : [...(line.taxIds ?? [])].sort((left, right) => {
          const leftCompound = taxById.get(left)?.isCompound ?? false;
          const rightCompound = taxById.get(right)?.isCompound ?? false;
          return Number(leftCompound) - Number(rightCompound);
        });

    return {
      organizationId,
      position: index + 1,
      description: line.description,
      skuSnapshot: product?.sku ?? null,
      productId: line.productId ?? null,
      quantity: toDbDecimal(line.quantity),
      unitPrice: toDbDecimal(line.unitPrice),
      discountPercent: roundPercent(line.discountPercent ?? 0),
      discountAmount: toDbDecimal(totals.discountAmount),
      taxable: line.taxable ?? true,
      taxAmount: toDbDecimal(totals.taxAmount),
      amount: toDbDecimal(totals.amount),
      taxes: {
        create: lineTaxes.map((taxId, taxIndex) => {
          const tax = taxById.get(taxId);
          if (!tax) throw new DomainError(ErrorCodes.TAX_INVALID, "Unknown tax selected.");
          const taxAmount = totals.taxBreakdown[taxIndex] ?? new Decimal(0);
          return {
            organizationId,
            taxId,
            nameSnapshot: taxNameById.get(taxId) ?? tax.name,
            rateSnapshot: roundPercent(tax.rate),
            amount: toDbDecimal(taxAmount),
          };
        }),
      },
    };
  });

  return {
    itemData,
    subtotal: calculated.subtotal,
    discountAmount: calculated.discountAmount,
    taxAmount: calculated.taxAmount,
    total: calculated.total,
  };
}

async function findInvoice(db: Db, id: string) {
  const record = await db.invoice.findFirst({ where: { id, deletedAt: null }, include: invoiceInclude });
  if (!record) throw new NotFoundError("Invoice");
  return record;
}

async function assertAccess(session: Session, record: InvoiceRecord): Promise<void> {
  assertOwnership(session, record.createdById, dataScopeFor(session));
}

export async function listInvoices(query: InvoiceListQuery): Promise<Result<InvoiceListResult>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:view");
    const db = await getTenantDb();

    const where: Prisma.InvoiceWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { invoiceNumber: { contains: query.q, mode: "insensitive" } },
        { customer: { displayName: { contains: query.q, mode: "insensitive" } } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.from || query.to) {
      where.issueDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.overdue) {
      where.status = { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] };
      where.dueDate = { lt: new Date() };
      where.balanceDue = { gt: 0 };
    }
    if (dataScopeFor(session) === "own") where.createdById = session.user.id;

    const cursor = decode(query.cursor);
    const cursorFilter = cursorCondition(cursor);
    if (cursorFilter) where.AND = [cursorFilter];

    const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = [
      { [query.sort]: query.dir },
      { id: query.dir },
    ];

    const rows = await db.invoice.findMany({
      where,
      select: invoiceListSelect,
      orderBy,
      take: query.limit + 1,
    });

    const total = cursor ? undefined : await db.invoice.count({ where });

    return {
      items: rows.slice(0, query.limit).map(mapListItem),
      ...(nextCursor(rows, query.limit) ? { nextCursor: nextCursor(rows, query.limit) } : {}),
      ...(total !== undefined ? { total } : {}),
    };
  });
}

function decode(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      "createdAt" in parsed && "id" in parsed &&
      typeof parsed.createdAt === "string" && typeof parsed.id === "string"
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

export async function getInvoice(id: string): Promise<Result<InvoiceDetail>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:view");
    const db = await getTenantDb();
    const record = await findInvoice(db, id);
    await assertAccess(session, record);
    return mapDetail(record);
  });
}

export async function createInvoice(input: InvoiceFormOutput): Promise<Result<InvoiceDetail>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:create");
    const db = await getTenantDb();

    const customer = await db.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new DomainError(ErrorCodes.CUSTOMER_INVALID, "Select a valid customer.");

    const prepared = await prepareLines(db, session.organizationId, input.lines);
    const settings = await loadSettings(db, session.organizationId);
    const invoiceNumber = await allocateNumber(db, DocumentType.INVOICE, settings.prefix, session.organizationId);
    const baseCurrencyCode = customer.currencyCode ?? settings.currency;
    const exchangeRate = baseCurrencyCode === input.currencyCode ? 1 : 1;

    const created = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          organizationId: session.organizationId,
          customerId: input.customerId,
          invoiceNumber,
          status: "DRAFT",
          currencyCode: input.currencyCode,
          baseCurrencyCode,
          exchangeRate,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          footer: input.footer ?? null,
          subtotal: toDbDecimal(prepared.subtotal),
          discountAmount: toDbDecimal(prepared.discountAmount),
          taxAmount: toDbDecimal(prepared.taxAmount),
          total: toDbDecimal(prepared.total),
          balanceDue: toDbDecimal(prepared.total),
          createdById: session.user.id,
          items: { create: prepared.itemData },
        },
      });

      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: invoice.id,
          actorId: session.user.id,
          type: InvoiceEventType.CREATED,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.CREATE,
          entityType: EntityType.INVOICE,
          entityId: invoice.id,
          after: { invoiceNumber, total: toDbDecimal(prepared.total).toString() } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        },
      });

      return invoice;
    });

    return mapDetail(await findInvoice(db, created.id));
  });
}

export async function updateInvoice(
  id: string,
  input: InvoiceFormOutput,
  expectedVersion: number,
): Promise<Result<InvoiceDetail>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:edit");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);

    if (!isEditable(existing.status)) {
      throw new DomainError(
        ErrorCodes.INVALID_TRANSITION,
        `Invoices in ${existing.status} status cannot be edited.`,
      );
    }
    if (existing.version !== expectedVersion) throw new ConflictError();
    if (existing.status !== "DRAFT" && !input.changeReason) {
      throw new DomainError(ErrorCodes.INVARIANT, "A reason is required when editing an issued invoice.");
    }

    const customer = await db.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new DomainError(ErrorCodes.CUSTOMER_INVALID, "Select a valid customer.");
    const prepared = await prepareLines(db, session.organizationId, input.lines);

    const updated = await db.$transaction(async (tx) => {
      const snapshot = {
        invoiceNumber: existing.invoiceNumber,
        status: existing.status,
        customerId: existing.customerId,
        currencyCode: existing.currencyCode,
        issueDate: existing.issueDate,
        dueDate: existing.dueDate,
        total: existing.total.toString(),
        items: existing.items.map((item) => ({
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          taxes: item.taxes.map((tax) => tax.taxId),
        })),
      } satisfies Prisma.InputJsonValue;

      if (existing.status !== "DRAFT") {
        await tx.invoiceRevision.create({
          data: {
            organizationId: session.organizationId,
            invoiceId: existing.id,
            version: existing.version,
            reason: input.changeReason ?? null,
            snapshot,
            changedById: session.user.id,
          },
        });
      }

      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });

      const invoice = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          customerId: input.customerId,
          currencyCode: input.currencyCode,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          footer: input.footer ?? null,
          subtotal: toDbDecimal(prepared.subtotal),
          discountAmount: toDbDecimal(prepared.discountAmount),
          taxAmount: toDbDecimal(prepared.taxAmount),
          total: toDbDecimal(prepared.total),
          balanceDue: clampNonNegative(toDbDecimal(prepared.total).minus(existing.amountPaid)),
          version: { increment: 1 },
          items: { create: prepared.itemData },
        },
      });

      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: existing.id,
          actorId: session.user.id,
          type: InvoiceEventType.UPDATED,
          message: input.changeReason ?? "Invoice details updated.",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.UPDATE,
          entityType: EntityType.INVOICE,
          entityId: existing.id,
          before: snapshot,
          after: { total: toDbDecimal(prepared.total).toString() } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        },
      });

      return invoice;
    });

    return mapDetail(await findInvoice(db, updated.id));
  });
}

export async function deleteInvoice(id: string): Promise<Result<{ id: string }>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:delete");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);
    transition(existing.status, "DELETE");

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.DELETE,
          entityType: EntityType.INVOICE,
          entityId: id,
          correlationId: randomUUID(),
        },
      });
    });

    return { id };
  });
}

export async function sendInvoice(id: string): Promise<Result<{ status: DbInvoiceStatus; emailQueued: boolean }>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:send");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);
    const nextStatus = transition(existing.status, "SEND");

    if (!existing.customer.email) {
      throw new DomainError(ErrorCodes.CUSTOMER_INVALID, "The customer needs an email address before sending.");
    }

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { status: nextStatus, sentAt: new Date(), sentById: session.user.id, version: { increment: 1 } },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: id,
          actorId: session.user.id,
          type: InvoiceEventType.SENT,
        },
      });
      await tx.emailOutbox.create({
        data: {
          organizationId: session.organizationId,
          entityType: EntityType.INVOICE,
          entityId: id,
          invoiceId: id,
          toAddress: existing.customer.email!,
          subject: `Invoice ${existing.invoiceNumber}`,
          status: OutboxStatus.PENDING,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.SEND,
          entityType: EntityType.INVOICE,
          entityId: id,
          correlationId: randomUUID(),
        },
      });
    });

    return { status: nextStatus, emailQueued: true };
  });
}

export async function cancelInvoice(id: string, reason: string): Promise<Result<{ status: DbInvoiceStatus }>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:cancel");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);
    const nextStatus = transition(existing.status, "CANCEL");

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: nextStatus,
          cancelledAt: new Date(),
          cancelReason: reason.trim(),
          version: { increment: 1 },
        },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: id,
          actorId: session.user.id,
          type: InvoiceEventType.CANCELLED,
          message: reason,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.CANCEL,
          entityType: EntityType.INVOICE,
          entityId: id,
          after: { reason } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        },
      });
    });

    return { status: nextStatus };
  });
}

export async function duplicateInvoice(id: string): Promise<Result<InvoiceDetail>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:create");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);

    const settings = await loadSettings(db, session.organizationId);
    const invoiceNumber = await allocateNumber(db, DocumentType.INVOICE, settings.prefix, session.organizationId);

    const created = await db.invoice.create({
      data: {
        organizationId: session.organizationId,
        customerId: existing.customerId,
        invoiceNumber,
        status: "DRAFT",
        currencyCode: existing.currencyCode,
        baseCurrencyCode: existing.baseCurrencyCode,
        exchangeRate: existing.exchangeRate,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + settings.dueDays * 86_400_000),
        reference: existing.reference,
        notes: existing.notes,
        terms: existing.terms,
        footer: existing.footer,
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        taxAmount: existing.taxAmount,
        total: existing.total,
        balanceDue: existing.total,
        createdById: session.user.id,
        items: {
          create: existing.items.map((item, index) => ({
            organizationId: session.organizationId,
            position: index + 1,
            description: item.description,
            skuSnapshot: item.skuSnapshot,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            discountAmount: item.discountAmount,
            taxable: item.taxable,
            taxAmount: item.taxAmount,
            amount: item.amount,
            taxes: {
              create: item.taxes.map((tax) => ({
                organizationId: session.organizationId,
                taxId: tax.taxId,
                nameSnapshot: tax.nameSnapshot,
                rateSnapshot: tax.rateSnapshot,
                amount: tax.amount,
              })),
            },
          })),
        },
      },
    });

    await writeEvent(db, session, created.id, InvoiceEventType.CREATED, `Duplicated from ${existing.invoiceNumber}.`);
    await writeAudit(db, session, AuditAction.CREATE, EntityType.INVOICE, created.id);

    return mapDetail(await findInvoice(db, created.id));
  });
}

export async function recordPayment(input: RecordPaymentInput): Promise<Result<{ paymentId: string; balanceDue: string }>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "payment:record");
    const db = await getTenantDb();
    const existing = await findInvoice(db, input.invoiceId);
    await assertAccess(session, existing);
    transition(existing.status, "RECORD_PAYMENT");

    const amount = toDbDecimal(input.amount);
    if (amount.gt(existing.balanceDue)) {
      throw new DomainError(ErrorCodes.AMOUNT_EXCEEDS_BALANCE, "Payment cannot exceed the invoice balance.");
    }

    const paymentNumber = await allocateNumber(
      db,
      DocumentType.PAYMENT,
      APP.defaultPaymentPrefix,
      session.organizationId,
    );

    const result = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Invoice"
        WHERE id = ${existing.id}::uuid AND "organizationId" = ${session.organizationId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError("Invoice");

      const payment = await tx.payment.create({
        data: {
          organizationId: session.organizationId,
          customerId: existing.customerId,
          paymentNumber,
          amount,
          unappliedAmount: new Decimal(0),
          currencyCode: existing.currencyCode,
          paidAt: input.paidAt,
          method: input.method ?? PaymentMethod.OTHER,
          reference: input.reference ?? null,
          status: PaymentStatus.COMPLETED,
          createdById: session.user.id,
          applications: {
            create: { organizationId: session.organizationId, invoiceId: existing.id, amount },
          },
        },
      });

      const amountPaid = roundMoney(existing.amountPaid.plus(amount));
      const balanceDue = roundMoney(existing.total.minus(amountPaid));
      const nextStatus: DbInvoiceStatus = balanceDue.lte(0) ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: existing.id },
        data: { amountPaid, balanceDue, status: nextStatus, version: { increment: 1 } },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: existing.id,
          actorId: session.user.id,
          type: InvoiceEventType.PAYMENT_RECEIVED,
          message: `Payment of ${amount.toString()} ${existing.currencyCode} recorded.`,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.PAYMENT_RECORD,
          entityType: EntityType.PAYMENT,
          entityId: payment.id,
          after: { invoiceId: existing.id, amount: amount.toString() } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        },
      });

      return { paymentId: payment.id, balanceDue: balanceDue.toString() };
    });

    return result;
  });
}
