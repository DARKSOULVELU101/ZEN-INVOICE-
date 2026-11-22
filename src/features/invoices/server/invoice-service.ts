import { randomUUID } from "node:crypto";
import {
  AuditAction,
  CurrencyCode,
  DocumentType,
  EmailDeliveryStatus,
  EntityType,
  InvoiceEventType,
  OutboxStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type InvoiceStatus as DbInvoiceStatus,
} from "@prisma/client";
import { APP } from "@/config/app";
import { formatMoney } from "@/lib/format/format";
import { isValidEmailAddress, normalizeEmailAddress } from "@/features/email/domain/address";
import { loadEmailConfig } from "@/features/email/server/config";
import { createEmailProvider } from "@/features/email/server/providers";
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
import { cursorCondition, decodeCursor, nextCursor } from "@/lib/query/cursor";
import { assertOwnership, dataScopeFor, requirePermission } from "@/lib/rbac/guard";
import {
  clampNonNegative,
  Decimal,
  roundMoney,
  roundPercent,
  toDbDecimal,
  type DecimalInput,
} from "@/lib/money/decimal";
import {
  deriveInvoiceDates,
  parseCalendarDate,
  toCalendarDateInput,
  todayCalendarDate,
} from "../domain/dates";
import { calculateInvoiceTotals, taxComponentFor, type TaxRateInput } from "../domain/totals";
import { displayStatus, isEditable, transition } from "../domain/status";
import { buildInvoiceEmail } from "./invoice-email-template";
import { generateInvoicePdf, type InvoicePdfData } from "./invoice-pdf";
import { invoiceSortFields, type InvoiceFormOutput, type InvoiceListQuery } from "../schemas/invoice";
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
  customer: {
    select: {
      id: true, displayName: true, legalName: true, email: true, phone: true,
      taxId: true, gstin: true, stateCode: true, status: true, deletedAt: true,
      addresses: {
        where: { isDefault: true },
        take: 1,
        select: {
          line1: true, line2: true, city: true, state: true,
          stateCode: true, postalCode: true, countryCode: true,
        },
      },
    },
  },
  organization: {
    select: {
      id: true, name: true, legalName: true, gstin: true, stateCode: true,
      settings: true,
      branches: {
        where: { isPrimary: true, deletedAt: null },
        take: 1,
        select: {
          name: true, addressLine1: true, addressLine2: true, city: true,
          state: true, stateCode: true, postalCode: true, countryCode: true,
          gstin: true,
        },
      },
    },
  },
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
  invoiceDate: true,
  issueDate: true,
  paymentTerms: true,
  dueDate: true,
  currencyCode: true,
  subtotal: true,
  discountAmount: true,
  taxableAmount: true,
  shippingAmount: true,
  cgstAmount: true,
  sgstAmount: true,
  igstAmount: true,
  roundOffAmount: true,
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
    invoiceDate: toCalendarDateInput(record.invoiceDate),
    issueDate: toCalendarDateInput(record.issueDate),
    paymentTerms: record.paymentTerms,
    dueDate: toCalendarDateInput(record.dueDate),
    currencyCode: record.currencyCode,
    subtotal: numberString(record.subtotal),
    discountAmount: numberString(record.discountAmount),
    taxableAmount: numberString(record.taxableAmount),
    shippingAmount: numberString(record.shippingAmount),
    cgstAmount: numberString(record.cgstAmount),
    sgstAmount: numberString(record.sgstAmount),
    igstAmount: numberString(record.igstAmount),
    roundOffAmount: numberString(record.roundOffAmount),
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
    hsnSac: line.hsnSac,
    productId: line.productId,
    quantity: numberString(line.quantity),
    unitPrice: numberString(line.unitPrice),
    discountPercent: numberString(line.discountPercent),
    discountAmount: numberString(line.discountAmount),
    taxable: line.taxable,
    taxableAmount: numberString(line.taxableAmount),
    cgstAmount: numberString(line.cgstAmount),
    sgstAmount: numberString(line.sgstAmount),
    igstAmount: numberString(line.igstAmount),
    taxAmount: numberString(line.taxAmount),
    amount: numberString(line.amount),
    taxes: line.taxes.map((tax) => ({
      id: tax.taxId,
      name: tax.nameSnapshot,
      component: tax.component,
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
      paidAt: toCalendarDateInput(application.payment.paidAt),
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
    gstin: record.gstin,
    sourceStateCode: record.sourceStateCode,
    destinationStateCode: record.destinationStateCode,
    isReverseCharge: record.isReverseCharge,
    reference: record.reference,
    notes: record.notes,
    terms: record.terms,
    footer: record.footer,
    sentAt: dateString(record.sentAt),
    cancelledAt: dateString(record.cancelledAt),
    cancelReason: record.cancelReason,
    branchId: record.branchId,
    customerEmail: record.customer.email,
    customerCompany: record.customer.legalName ?? record.customer.displayName,
    emailDeliveryStatus: record.emailDeliveryStatus,
    emailDeliveredAt: dateString(record.emailDeliveredAt),
    items: record.items.map(mapLine),
    events,
    payments,
    revisionCount: record.revisions.length,
  };
}

function addressLines(value: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
} | null | undefined): string[] {
  if (!value) return [];
  const line1 = value.line1 ?? value.addressLine1 ?? null;
  const line2 = value.line2 ?? value.addressLine2 ?? null;
  const locality = [value.city, value.state, value.postalCode].filter(Boolean).join(", ");
  const country = value.countryCode ? [locality, value.countryCode].filter(Boolean).join(" ") : locality;
  return [line1, line2, country].filter((line): line is string => Boolean(line));
}

function buildInvoicePdfData(record: InvoiceRecord): InvoicePdfData {
  const branch = record.organization.branches[0];
  const customerAddress = record.customer.addresses[0];
  const companyName = record.organization.legalName ?? record.organization.name;

  return {
    companyName,
    companyLegalName: record.organization.legalName,
    companyGstin: branch?.gstin ?? record.organization.gstin,
    companyAddressLines: addressLines(branch),
    customerName: record.customer.displayName,
    customerCompany: record.customer.legalName ?? record.customer.displayName,
    customerGstin: record.customer.gstin,
    customerEmail: record.customer.email,
    customerAddressLines: addressLines(customerAddress),
    invoiceNumber: record.invoiceNumber,
    issueDate: toCalendarDateInput(record.issueDate),
    invoiceDate: toCalendarDateInput(record.invoiceDate),
    dueDate: toCalendarDateInput(record.dueDate),
    reference: record.reference,
    currencyCode: record.currencyCode,
    subtotal: numberString(record.subtotal),
    discountAmount: numberString(record.discountAmount),
    taxableAmount: numberString(record.taxableAmount),
    shippingAmount: numberString(record.shippingAmount),
    cgstAmount: numberString(record.cgstAmount),
    sgstAmount: numberString(record.sgstAmount),
    igstAmount: numberString(record.igstAmount),
    taxAmount: numberString(record.taxAmount),
    roundOffAmount: numberString(record.roundOffAmount),
    total: numberString(record.total),
    amountPaid: numberString(record.amountPaid),
    balanceDue: numberString(record.balanceDue),
    notes: record.notes,
    terms: record.terms ?? record.organization.settings?.invoiceTerms ?? null,
    footer: record.footer ?? record.organization.settings?.invoiceFooter ?? null,
    lines: record.items.map((line) => ({
      description: line.description,
      hsnSac: line.hsnSac,
      quantity: numberString(line.quantity),
      unitPrice: numberString(line.unitPrice),
      discountAmount: numberString(line.discountAmount),
      taxAmount: numberString(line.taxAmount),
      amount: numberString(line.amount),
      taxNames: line.taxes.map((tax) => tax.nameSnapshot),
    })),
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

async function loadOrganizationProfile(db: Db, organizationId: string) {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { gstin: true, stateCode: true },
  });
  return { gstin: organization?.gstin ?? null, stateCode: organization?.stateCode ?? null };
}

async function resolveExchangeRate(
  db: Db,
  organizationId: string,
  from: CurrencyCode,
  to: CurrencyCode,
  date: Date,
): Promise<Decimal> {
  if (from === to) return new Decimal(1);
  const rate = await db.exchangeRate.findFirst({
    where: {
      organizationId,
      fromCurrencyCode: from,
      toCurrencyCode: to,
      rateDate: { lte: date },
    },
    orderBy: { rateDate: "desc" },
  });
  if (!rate) {
    throw new DomainError(
      ErrorCodes.EXCHANGE_RATE_MISSING,
      `No exchange rate is configured for ${from} to ${to} on or before ${toCalendarDateInput(date)}.`,
    );
  }
  return new Decimal(rate.rate.toString());
}

interface PreparedLines {
  itemData: Prisma.InvoiceItemUncheckedCreateWithoutInvoiceInput[];
  subtotal: Decimal;
  netSubtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  shippingAmount: Decimal;
  cgstAmount: Decimal;
  sgstAmount: Decimal;
  igstAmount: Decimal;
  roundOffAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

interface PrepareLinesOptions {
  shippingAmount?: DecimalInput;
  roundOffAmount?: DecimalInput;
  sourceStateCode?: string | null;
  destinationStateCode?: string | null;
}

async function prepareLines(
  db: Db,
  organizationId: string,
  lines: readonly InvoiceLineInput[],
  options: PrepareLinesOptions = {},
): Promise<PreparedLines> {
  const taxIds = [...new Set(lines.flatMap((line) => (line.taxIds ?? []).filter(() => line.taxable !== false)))];
  const productIds = [...new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))];

  if (productIds.length !== lines.length || lines.some((line) => !line.productId)) {
    throw new DomainError(ErrorCodes.PRODUCT_INVALID, "Every line must reference a valid product.");
  }

  const [taxes, products] = await Promise.all([
    taxIds.length ? db.tax.findMany({ where: { id: { in: taxIds } } }) : Promise.resolve([]),
    db.product.findMany({ where: { id: { in: productIds } } }),
  ]);

  if (taxes.length !== taxIds.length) {
    throw new DomainError(ErrorCodes.TAX_INVALID, "One or more selected taxes are no longer available.");
  }
  if (products.length !== productIds.length) {
    throw new DomainError(ErrorCodes.PRODUCT_INVALID, "One or more selected products are no longer available.");
  }

  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const sourceStateCode = options.sourceStateCode ?? null;
  const destinationStateCode = options.destinationStateCode ?? null;
  const interstate = Boolean(
    sourceStateCode && destinationStateCode && sourceStateCode.toUpperCase() !== destinationStateCode.toUpperCase(),
  );

  const taxRateFor = (id: string): TaxRateInput => {
    const tax = taxById.get(id);
    if (!tax) throw new DomainError(ErrorCodes.TAX_INVALID, "Unknown tax selected.");
    return {
      rate: tax.rate.toString(),
      component: tax.component,
      type: tax.type,
      isCompound: tax.isCompound,
      isInclusive: tax.isInclusive,
    };
  };

  const shippingTaxRates = lines.find((line) => line.taxable !== false && (line.taxIds?.length ?? 0) > 0)?.taxIds?.map(taxRateFor) ?? [];
  const calculated = calculateInvoiceTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
      taxes: line.taxable === false ? [] : (line.taxIds ?? []).map(taxRateFor),
    })),
    {
      shippingAmount: options.shippingAmount ?? 0,
      shippingTaxable: false,
      shippingTaxRates,
      roundOffAmount: options.roundOffAmount ?? 0,
      sourceStateCode,
      destinationStateCode,
    },
  );

  const itemData = lines.map((line, index): Prisma.InvoiceItemUncheckedCreateWithoutInvoiceInput => {
    const totals = calculated.lines[index];
    if (!totals) throw new Error("Totals calculation did not produce a line result.");
    const product = line.productId ? productById.get(line.productId) : undefined;
    if (!product) throw new DomainError(ErrorCodes.PRODUCT_INVALID, "Select a valid product.");
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
      skuSnapshot: product.sku,
      hsnSac: line.hsnSac ?? product.hsnSac,
      productId: product.id,
      quantity: toDbDecimal(line.quantity),
      unitPrice: toDbDecimal(line.unitPrice),
      discountPercent: roundPercent(line.discountPercent ?? 0),
      discountAmount: toDbDecimal(totals.discountAmount),
      taxable: line.taxable ?? true,
      taxableAmount: toDbDecimal(totals.taxableAmount),
      cgstAmount: toDbDecimal(totals.gst.cgstAmount),
      sgstAmount: toDbDecimal(totals.gst.sgstAmount),
      igstAmount: toDbDecimal(totals.gst.igstAmount),
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
            nameSnapshot: tax.name,
            component: taxComponentFor(taxRateFor(taxId), interstate),
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
    netSubtotal: calculated.netSubtotal,
    discountAmount: calculated.discountAmount,
    taxableAmount: calculated.taxableAmount,
    shippingAmount: calculated.shippingAmount,
    cgstAmount: calculated.cgstAmount,
    sgstAmount: calculated.sgstAmount,
    igstAmount: calculated.igstAmount,
    roundOffAmount: calculated.roundOffAmount,
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
      where.invoiceDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.overdue) {
      where.status = { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] };
      where.dueDate = { lt: parseCalendarDate(todayCalendarDate())! };
      where.balanceDue = { gt: 0 };
    }
    if (dataScopeFor(session) === "own") where.createdById = session.user.id;

    const decodedCursor = decodeCursor(query.cursor);
    const cursor = decodedCursor
      && decodedCursor.sort === query.sort
      && decodedCursor.dir === query.dir
      && invoiceSortFields.includes(decodedCursor.sort as (typeof invoiceSortFields)[number])
      ? decodedCursor
      : null;
    const cursorFilter = cursorCondition(cursor) as Prisma.InvoiceWhereInput | undefined;
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
      ...(nextCursor(rows, query.limit, query.sort, query.dir)
        ? { nextCursor: nextCursor(rows, query.limit, query.sort, query.dir) }
        : {}),
      ...(total !== undefined ? { total } : {}),
    };
  });
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

    const settings = await loadSettings(db, session.organizationId);
    const organizationProfile = await loadOrganizationProfile(db, session.organizationId);
    const sourceStateCode = input.sourceStateCode ?? organizationProfile.stateCode;
    const destinationStateCode = input.destinationStateCode ?? customer.stateCode ?? sourceStateCode;
    const prepared = await prepareLines(db, session.organizationId, input.lines, {
      shippingAmount: input.shippingAmount,
      roundOffAmount: input.roundOffAmount,
      sourceStateCode,
      destinationStateCode,
    });
    const invoiceNumber = await allocateNumber(db, DocumentType.INVOICE, settings.prefix, session.organizationId);
    const dates = deriveInvoiceDates(input.invoiceDate, input.paymentTerms);
    const baseCurrencyCode = settings.currency;
    const exchangeRate = await resolveExchangeRate(
      db,
      session.organizationId,
      baseCurrencyCode,
      input.currencyCode,
      dates.invoiceDate,
    );

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
          gstin: input.gstin ?? customer.gstin ?? organizationProfile.gstin,
          sourceStateCode,
          destinationStateCode,
          isReverseCharge: input.isReverseCharge ?? false,
          invoiceDate: dates.invoiceDate,
          issueDate: dates.issueDate,
          paymentTerms: input.paymentTerms,
          dueDate: dates.dueDate,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          footer: input.footer ?? null,
          subtotal: toDbDecimal(prepared.subtotal),
          discountAmount: toDbDecimal(prepared.discountAmount),
          taxableAmount: toDbDecimal(prepared.taxableAmount),
          shippingAmount: toDbDecimal(prepared.shippingAmount),
          cgstAmount: toDbDecimal(prepared.cgstAmount),
          sgstAmount: toDbDecimal(prepared.sgstAmount),
          igstAmount: toDbDecimal(prepared.igstAmount),
          roundOffAmount: toDbDecimal(prepared.roundOffAmount),
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
    const preservedStatus = transition(existing.status, "EDIT");
    if (existing.version !== expectedVersion) throw new ConflictError();
    if (existing.status !== "DRAFT" && !input.changeReason) {
      throw new DomainError(ErrorCodes.INVARIANT, "A reason is required when editing an issued invoice.");
    }

    const customer = await db.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new DomainError(ErrorCodes.CUSTOMER_INVALID, "Select a valid customer.");
    const settings = await loadSettings(db, session.organizationId);
    const organizationProfile = await loadOrganizationProfile(db, session.organizationId);
    const sourceStateCode = input.sourceStateCode ?? organizationProfile.stateCode;
    const destinationStateCode = input.destinationStateCode ?? customer.stateCode ?? sourceStateCode;
    const prepared = await prepareLines(db, session.organizationId, input.lines, {
      shippingAmount: input.shippingAmount,
      roundOffAmount: input.roundOffAmount,
      sourceStateCode,
      destinationStateCode,
    });
    const dates = deriveInvoiceDates(input.invoiceDate, input.paymentTerms);
    const exchangeRate = await resolveExchangeRate(
      db,
      session.organizationId,
      settings.currency,
      input.currencyCode,
      dates.invoiceDate,
    );

    const updated = await db.$transaction(async (tx) => {
      const snapshot = {
        invoiceNumber: existing.invoiceNumber,
        status: existing.status,
        customerId: existing.customerId,
        currencyCode: existing.currencyCode,
        invoiceDate: existing.invoiceDate.toISOString(),
        issueDate: existing.issueDate.toISOString(),
        paymentTerms: existing.paymentTerms,
        dueDate: existing.dueDate.toISOString(),
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
          baseCurrencyCode: settings.currency,
          exchangeRate,
          gstin: input.gstin ?? customer.gstin ?? organizationProfile.gstin,
          sourceStateCode,
          destinationStateCode,
          status: preservedStatus,
          isReverseCharge: input.isReverseCharge ?? false,
          invoiceDate: dates.invoiceDate,
          issueDate: dates.issueDate,
          paymentTerms: input.paymentTerms,
          dueDate: dates.dueDate,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          footer: input.footer ?? null,
          subtotal: toDbDecimal(prepared.subtotal),
          discountAmount: toDbDecimal(prepared.discountAmount),
          taxableAmount: toDbDecimal(prepared.taxableAmount),
          shippingAmount: toDbDecimal(prepared.shippingAmount),
          cgstAmount: toDbDecimal(prepared.cgstAmount),
          sgstAmount: toDbDecimal(prepared.sgstAmount),
          igstAmount: toDbDecimal(prepared.igstAmount),
          roundOffAmount: toDbDecimal(prepared.roundOffAmount),
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

export interface SendInvoiceResult {
  status: DbInvoiceStatus;
  emailDelivered: boolean;
  providerMessageId: string;
  sentAt: string;
}

export async function sendInvoice(
  id: string,
  options: { resend?: boolean } = {},
): Promise<Result<SendInvoiceResult>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:send");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);

    const action = options.resend ? "RESEND" : "SEND";
    const nextStatus = transition(existing.status, action);

    if (existing.customer.status !== "ACTIVE" || existing.customer.deletedAt) {
      throw new DomainError(
        ErrorCodes.CUSTOMER_INVALID,
        "This customer is inactive. Update the customer before sending the invoice.",
      );
    }

    if (!isValidEmailAddress(existing.customer.email)) {
      throw new DomainError(
        ErrorCodes.CUSTOMER_NO_EMAIL,
        "Add a valid email address to this customer before sending the invoice.",
      );
    }

    if (!existing.items.length || !existing.invoiceNumber) {
      throw new DomainError(
        ErrorCodes.INVARIANT,
        "Add at least one line item and save the invoice before sending it.",
      );
    }

    const duplicate = await db.emailOutbox.findFirst({
      where: {
        invoiceId: id,
        purpose: "INVOICE_SEND",
        status: { in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING, OutboxStatus.SENT] },
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError("This invoice was sent moments ago. Wait a moment before sending it again.");
    }

    const recordFailure = async (message: string, provider?: string) => {
      const lastError = message.slice(0, 500);
      try {
        await db.$transaction(async (tx) => {
          await tx.invoice.update({
            where: { id },
            data: {
              emailDeliveryStatus: EmailDeliveryStatus.FAILED,
              emailLastError: lastError,
            },
          });
          await tx.invoiceEvent.create({
            data: {
              organizationId: session.organizationId,
              invoiceId: id,
              actorId: session.user.id,
              type: InvoiceEventType.EMAIL_FAILED,
              message: "Invoice email delivery failed",
              metadata: { reason: lastError },
            },
          });
          await tx.emailOutbox.create({
            data: {
              organizationId: session.organizationId,
              entityType: EntityType.INVOICE,
              entityId: id,
              invoiceId: id,
              toAddress: existing.customer.email ?? "",
              subject: `Invoice ${existing.invoiceNumber}`,
              status: OutboxStatus.FAILED,
              attempts: 1,
              provider,
              lastError,
              purpose: "INVOICE_SEND",
            },
          });
        });
      } catch {
        return;
      }
    };

    let config;
    let provider;
    try {
      config = loadEmailConfig();
      provider = createEmailProvider(config);
    } catch {
      await recordFailure("Email delivery is not configured.");
      throw new DomainError(
        ErrorCodes.EMAIL_CONFIGURATION,
        "Email delivery is not configured. Contact your administrator.",
      );
    }

    let pdf: Buffer;
    try {
      pdf = await generateInvoicePdf(buildInvoicePdfData(existing));
    } catch {
      await recordFailure("Invoice PDF generation failed.", provider.name);
      throw new DomainError(
        ErrorCodes.PDF_GENERATION,
        "The invoice PDF could not be generated. Please try again.",
      );
    }

    const email = buildInvoiceEmail({
      invoiceNumber: existing.invoiceNumber,
      customerName: existing.customer.displayName,
      customerCompany: existing.customer.legalName ?? existing.customer.displayName,
      companyName: existing.organization.legalName ?? existing.organization.name,
      amount: formatMoney(existing.total, existing.currencyCode),
      dueDate: toCalendarDateInput(existing.dueDate),
    });

    const toAddress = normalizeEmailAddress(existing.customer.email);
    const senderAddress = config.provider === "EMAIL_API" ? "email-api" : config.from;
    const ccAddresses = config.provider === "EMAIL_API" ? [] : config.cc;
    const bccAddresses = config.provider === "EMAIL_API" ? [] : config.bcc;
    const replyToAddress = config.provider === "EMAIL_API" ? undefined : config.replyTo;
    const message = {
      from: senderAddress,
      to: [toAddress],
      cc: ccAddresses,
      bcc: bccAddresses,
      ...(replyToAddress ? { replyTo: replyToAddress } : {}),
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: [{
        filename: `${existing.invoiceNumber}.pdf`,
        contentType: "application/pdf",
        content: pdf,
      }],
      headers: { invoiceId: id },
      idempotencyKey: randomUUID(),
    };

    let providerMessageId: string;
    try {
      const sent = await provider.send(message);
      providerMessageId = sent.providerMessageId;
    } catch {
      await recordFailure("The email provider rejected the message.", provider.name);
      throw new DomainError(
        ErrorCodes.EMAIL_DELIVERY,
        "The invoice email could not be delivered. The invoice was not marked as sent.",
      );
    }

    const sentAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: nextStatus,
          sentAt,
          sentById: session.user.id,
          emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
          emailDeliveredAt: sentAt,
          emailLastError: null,
          customerNameSnapshot: existing.customer.displayName,
          customerEmailSnapshot: toAddress,
          customerCompanySnapshot: existing.customer.legalName ?? existing.customer.displayName,
          ...(action === "SEND" ? { version: { increment: 1 } } : {}),
        },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: id,
          actorId: session.user.id,
          type: InvoiceEventType.SENT,
          message: action === "RESEND" ? "Invoice resent by email" : "Invoice sent by email",
        },
      });
      await tx.emailOutbox.create({
        data: {
          organizationId: session.organizationId,
          entityType: EntityType.INVOICE,
          entityId: id,
          invoiceId: id,
          toAddress,
          fromAddress: senderAddress,
          replyTo: replyToAddress ?? null,
          ccAddresses,
          bccAddresses,
          subject: email.subject,
          bodyText: email.text,
          bodyHtml: email.html,
          templateKey: "invoice-delivery-v1",
          attachmentName: `${existing.invoiceNumber}.pdf`,
          attachmentMimeType: "application/pdf",
          attachmentData: Uint8Array.from(pdf),
          provider: provider.name,
          providerMessageId,
          status: OutboxStatus.SENT,
          attempts: 1,
          scheduledAt: sentAt,
          nextAttemptAt: sentAt,
          sentAt,
          purpose: "INVOICE_SEND",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.SEND,
          entityType: EntityType.INVOICE,
          entityId: id,
          correlationId: providerMessageId,
        },
      });
    });

    return {
      status: nextStatus,
      emailDelivered: true,
      providerMessageId,
      sentAt: sentAt.toISOString(),
    };
  });
}

export async function markInvoiceViewed(id: string): Promise<Result<{ status: DbInvoiceStatus }>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "invoice:send");
    const db = await getTenantDb();
    const existing = await findInvoice(db, id);
    await assertAccess(session, existing);
    const nextStatus = transition(existing.status, "VIEW");

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { status: nextStatus, viewedAt: new Date(), version: { increment: 1 } },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: id,
          actorId: session.user.id,
          type: InvoiceEventType.VIEWED,
          message: "Invoice marked as viewed",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.VIEW,
          entityType: EntityType.INVOICE,
          entityId: id,
          correlationId: randomUUID(),
        },
      });
    });

    return { status: nextStatus };
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
    const duplicateDates = deriveInvoiceDates(
      parseCalendarDate(todayCalendarDate())!,
      existing.paymentTerms,
    );

    const created = await db.invoice.create({
      data: {
        organizationId: session.organizationId,
        customerId: existing.customerId,
        invoiceNumber,
        status: "DRAFT",
        currencyCode: existing.currencyCode,
        baseCurrencyCode: existing.baseCurrencyCode,
        exchangeRate: existing.exchangeRate,
        invoiceDate: duplicateDates.invoiceDate,
        issueDate: duplicateDates.issueDate,
        paymentTerms: existing.paymentTerms,
        dueDate: duplicateDates.dueDate,
        reference: existing.reference,
        notes: existing.notes,
        terms: existing.terms,
        footer: existing.footer,
        gstin: existing.gstin,
        sourceStateCode: existing.sourceStateCode,
        destinationStateCode: existing.destinationStateCode,
        isReverseCharge: existing.isReverseCharge,
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        taxableAmount: existing.taxableAmount,
        shippingAmount: existing.shippingAmount,
        cgstAmount: existing.cgstAmount,
        sgstAmount: existing.sgstAmount,
        igstAmount: existing.igstAmount,
        roundOffAmount: existing.roundOffAmount,
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
            taxableAmount: item.taxableAmount,
            cgstAmount: item.cgstAmount,
            sgstAmount: item.sgstAmount,
            igstAmount: item.igstAmount,
            taxAmount: item.taxAmount,
            amount: item.amount,
            taxes: {
              create: item.taxes.map((tax) => ({
                organizationId: session.organizationId,
                taxId: tax.taxId,
                nameSnapshot: tax.nameSnapshot,
                component: tax.component,
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

export async function listPayments(): Promise<Result<import("../types/invoice").PaymentListItem[]>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "payment:record");
    const db = await getTenantDb();
    const payments = await db.payment.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        currencyCode: true,
        paidAt: true,
        method: true,
        status: true,
        customer: { select: { displayName: true } },
        invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 500,
    });
    return payments.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      customerName: payment.customer.displayName,
      invoiceNumber: payment.invoice?.invoiceNumber ?? null,
      amount: numberString(payment.amount),
      currencyCode: payment.currencyCode,
      paidAt: toCalendarDateInput(payment.paidAt),
      method: payment.method,
      status: payment.status,
    }));
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
    const paymentNumber = await allocateNumber(
      db,
      DocumentType.PAYMENT,
      APP.defaultPaymentPrefix,
      session.organizationId,
    );

    const result = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{
        id: string;
        customerId: string;
        currencyCode: string;
        baseCurrencyCode: string;
        exchangeRate: string;
        total: string;
        status: DbInvoiceStatus;
      }[]>`
        SELECT
          id,
          "customerId"::text AS "customerId",
          "currencyCode"::text AS "currencyCode",
          "baseCurrencyCode"::text AS "baseCurrencyCode",
          "exchangeRate"::text AS "exchangeRate",
          total::text AS total,
          status
        FROM "Invoice"
        WHERE id = ${existing.id}::uuid AND "organizationId" = ${session.organizationId}::uuid
        FOR UPDATE
      `;
      const row = locked[0];
      if (!row) throw new NotFoundError("Invoice");

      const applied = await tx.paymentApplication.aggregate({
        where: { organizationId: session.organizationId, invoiceId: row.id },
        _sum: { amount: true },
      });
      const amountPaid = roundMoney(applied._sum.amount ?? 0);
      const balanceDue = roundMoney(new Decimal(row.total).minus(amountPaid));

      if (amount.gt(balanceDue)) {
        throw new DomainError(ErrorCodes.AMOUNT_EXCEEDS_BALANCE, "Payment cannot exceed the invoice balance.");
      }

      const exchangeRate = new Decimal(row.exchangeRate);
      const finalAmountPaid = roundMoney(amountPaid.plus(amount));
      const finalBalanceDue = roundMoney(new Decimal(row.total).minus(finalAmountPaid));
      const nextStatus = finalBalanceDue.lte(0)
        ? transition(row.status, "PAY")
        : transition(row.status, "RECORD_PAYMENT");

      const payment = await tx.payment.create({
        data: {
          organizationId: session.organizationId,
          customerId: row.customerId,
          invoiceId: row.id,
          paymentNumber,
          amount,
          unappliedAmount: new Decimal(0),
          currencyCode: row.currencyCode as CurrencyCode,
          baseCurrencyCode: row.baseCurrencyCode as CurrencyCode,
          exchangeRate,
          amountInBaseCurrency: roundMoney(amount.times(exchangeRate)),
          paidAt: input.paidAt,
          method: input.method ?? PaymentMethod.OTHER,
          reference: input.reference ?? null,
          status: PaymentStatus.COMPLETED,
          createdById: session.user.id,
          applications: {
            create: { organizationId: session.organizationId, invoiceId: row.id, amount },
          },
        },
      });

      await tx.invoice.update({
        where: { id: row.id },
        data: {
          amountPaid: finalAmountPaid,
          balanceDue: finalBalanceDue,
          status: nextStatus,
          version: { increment: 1 },
        },
      });
      await tx.invoiceEvent.create({
        data: {
          organizationId: session.organizationId,
          invoiceId: row.id,
          actorId: session.user.id,
          type: InvoiceEventType.PAYMENT_RECEIVED,
          message: `Payment of ${amount.toString()} ${row.currencyCode} recorded.`,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: AuditAction.PAYMENT_RECORD,
          entityType: EntityType.PAYMENT,
          entityId: payment.id,
          after: { invoiceId: row.id, amount: amount.toString() } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        },
      });

      return { paymentId: payment.id, balanceDue: finalBalanceDue.toString() };
    });

    return result;
  });
}
