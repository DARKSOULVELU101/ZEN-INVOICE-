import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { Decimal } from "@/lib/money/decimal";

const fontDirectory = path.join(process.cwd(), "public", "fonts", "invoice");

Font.register({
  family: "NotoSans",
  fonts: [
    {
      src: fs.existsSync(path.join(fontDirectory, "NotoSans-Regular.ttf"))
        ? path.join(fontDirectory, "NotoSans-Regular.ttf")
        : path.join(process.cwd(), "src", "features", "invoices", "pdf", "fonts", "NotoSans-Regular.ttf"),
      fontWeight: 400,
    },
    {
      src: fs.existsSync(path.join(fontDirectory, "NotoSans-Bold.ttf"))
        ? path.join(fontDirectory, "NotoSans-Bold.ttf")
        : path.join(process.cwd(), "src", "features", "invoices", "pdf", "fonts", "NotoSans-Bold.ttf"),
      fontWeight: 700,
    },
  ],
});

export interface InvoicePdfLine {
  description: string;
  hsnSac: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  amount: string;
  taxNames: string[];
}

export interface InvoicePdfData {
  companyName: string;
  companyLegalName: string | null;
  companyLogoUrl: string | null;
  companyGstin: string | null;
  companyAddressLines: string[];
  customerName: string;
  customerCompany: string | null;
  customerGstin: string | null;
  customerEmail: string | null;
  customerAddressLines: string[];
  invoiceNumber: string;
  status: string;
  sourceStateCode: string | null;
  destinationStateCode: string | null;
  placeOfSupplyCode: string | null;
  isReverseCharge: boolean;
  issueDate: string;
  invoiceDate: string;
  dueDate: string;
  reference: string | null;
  currencyCode: string;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  shippingAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  roundOffAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  footer: string | null;
  lines: InvoicePdfLine[];
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "NotoSans",
    fontSize: 8.5,
    color: "#27272a",
    backgroundColor: "#ffffff",
  },
  topBar: {
    height: 4,
    backgroundColor: "#4f46e5",
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 24,
  },
  companyBlock: {
    flexDirection: "row",
    gap: 12,
    maxWidth: "58%",
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: "contain",
  },
  monogram: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: {
    fontSize: 16,
    fontWeight: 700,
    color: "#3730a3",
  },
  companyDetails: {
    flexGrow: 1,
  },
  companyName: {
    fontSize: 17,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 3,
  },
  companyLine: {
    fontSize: 8,
    color: "#52525b",
    lineHeight: 12,
  },
  invoiceTitleBlock: {
    width: "38%",
    alignItems: "flex-end",
    textAlign: "right",
  },
  invoiceTitle: {
    fontSize: 23,
    fontWeight: 700,
    color: "#111827",
    letterSpacing: 1,
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#52525b",
    marginTop: 4,
  },
  statusPill: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#eef2ff",
  },
  statusText: {
    fontSize: 8,
    fontWeight: 700,
    color: "#3730a3",
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: "#e4e4e7",
    marginVertical: 16,
  },
  partyGrid: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 18,
  },
  billTo: {
    width: "48%",
  },
  meta: {
    width: "48%",
    marginLeft: "auto",
  },
  sectionLabel: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#71717a",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 10,
    fontWeight: 700,
    color: "#18181b",
    marginBottom: 3,
  },
  partyLine: {
    fontSize: 8.5,
    lineHeight: 12,
    color: "#52525b",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  metaLabel: {
    color: "#71717a",
    width: "45%",
  },
  metaValue: {
    color: "#18181b",
    fontWeight: 700,
    width: "55%",
    textAlign: "right",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  tableHeaderText: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#3f3f46",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  descriptionCell: {
    width: "36%",
    paddingRight: 8,
  },
  hsnCell: {
    width: "11%",
    textAlign: "right",
    paddingRight: 6,
  },
  qtyCell: {
    width: "8%",
    textAlign: "right",
    paddingRight: 6,
  },
  rateCell: {
    width: "14%",
    textAlign: "right",
    paddingRight: 6,
  },
  taxCell: {
    width: "13%",
    textAlign: "right",
    paddingRight: 6,
  },
  amountCell: {
    width: "18%",
    textAlign: "right",
  },
  itemDescription: {
    fontSize: 8.5,
    color: "#18181b",
    lineHeight: 11,
  },
  itemSub: {
    fontSize: 7.5,
    color: "#71717a",
    marginTop: 2,
    lineHeight: 10,
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 18,
  },
  totalsTable: {
    width: "48%",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: {
    color: "#52525b",
    width: "55%",
  },
  totalValue: {
    width: "45%",
    textAlign: "right",
    color: "#18181b",
    fontVariant: ["tabular-nums"],
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d8",
    borderBottomWidth: 2,
    borderBottomColor: "#4f46e5",
  },
  grandTotalLabel: {
    width: "55%",
    fontWeight: 700,
    color: "#111827",
  },
  grandTotalValue: {
    width: "45%",
    textAlign: "right",
    fontWeight: 700,
    fontSize: 11,
    color: "#111827",
  },
  notesBlock: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
  },
  notesLabel: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#475569",
    marginBottom: 5,
  },
  notesText: {
    fontSize: 8,
    lineHeight: 12,
    color: "#334155",
  },
  signatureBlock: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signatureBox: {
    width: 190,
    alignItems: "center",
  },
  signatureLine: {
    height: 1,
    backgroundColor: "#a1a1aa",
    width: "100%",
    marginBottom: 6,
  },
  signatureText: {
    fontSize: 8,
    color: "#52525b",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: "#a1a1aa",
  },
});

function safe(value: string | null | undefined, fallback = "—"): string {
  const text = value?.trim();
  return text ? text : fallback;
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function money(value: string, currency: string): string {
  const amount = new Decimal(value).toNumber();
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function quantity(value: string): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(new Decimal(value).toNumber());
}

function monogram(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const usesIgst = new Decimal(data.igstAmount).gt(0);
  const companyName = data.companyName || "Organization";

  return (
    <Document
      title={`Invoice ${data.invoiceNumber}`}
      author={companyName}
      subject={`Invoice ${data.invoiceNumber} from ${companyName}`}
      creator="Zenbook ERP"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.topBar} />

        <View style={styles.header}>
          <View style={styles.companyBlock}>
            {data.companyLogoUrl ? (
              createElement(Image, { src: data.companyLogoUrl, style: styles.logo })
            ) : (
              <View style={styles.monogram}>
                <Text style={styles.monogramText}>{monogram(companyName)}</Text>
              </View>
            )}
            <View style={styles.companyDetails}>
              <Text style={styles.companyName}>{companyName}</Text>
              {data.companyLegalName && data.companyLegalName !== companyName ? (
                <Text style={styles.companyLine}>{data.companyLegalName}</Text>
              ) : null}
              {data.companyGstin ? <Text style={styles.companyLine}>GSTIN {data.companyGstin}</Text> : null}
              {data.companyAddressLines.filter(Boolean).map((line) => (
                <Text key={line} style={styles.companyLine}>{line}</Text>
              ))}
            </View>
          </View>

          <View style={styles.invoiceTitleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{safe(data.status)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.partyGrid}>
          <View style={styles.billTo}>
            <Text style={styles.sectionLabel}>BILL TO</Text>
            <Text style={styles.partyName}>{safe(data.customerCompany ?? data.customerName)}</Text>
            {data.customerCompany && data.customerCompany !== data.customerName ? (
              <Text style={styles.partyLine}>{data.customerName}</Text>
            ) : null}
            {data.customerGstin ? <Text style={styles.partyLine}>GSTIN {data.customerGstin}</Text> : null}
            {data.customerEmail ? <Text style={styles.partyLine}>{data.customerEmail}</Text> : null}
            {data.customerAddressLines.filter(Boolean).map((line) => (
              <Text key={line} style={styles.partyLine}>{line}</Text>
            ))}
          </View>

          <View style={styles.meta}>
            <Text style={styles.sectionLabel}>INVOICE DETAILS</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice no.</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice date</Text>
              <Text style={styles.metaValue}>{displayDate(data.invoiceDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due date</Text>
              <Text style={styles.metaValue}>{displayDate(data.dueDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Place of supply</Text>
              <Text style={styles.metaValue}>{safe(data.placeOfSupplyCode)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Reference</Text>
              <Text style={styles.metaValue}>{safe(data.reference)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.descriptionCell]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.hsnCell]}>HSN/SAC</Text>
          <Text style={[styles.tableHeaderText, styles.qtyCell]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.rateCell]}>Rate</Text>
          <Text style={[styles.tableHeaderText, styles.taxCell]}>Tax</Text>
          <Text style={[styles.tableHeaderText, styles.amountCell]}>Amount</Text>
        </View>

        {data.lines.map((line, index) => (
          <View key={`${line.description}-${index}`} style={styles.tableRow} wrap={false}>
            <View style={styles.descriptionCell}>
              <Text style={styles.itemDescription}>{safe(line.description)}</Text>
              {line.taxNames.length ? (
                <Text style={styles.itemSub}>{line.taxNames.join(", ")}</Text>
              ) : null}
            </View>
            <Text style={[styles.itemSub, styles.hsnCell]}>{safe(line.hsnSac, "-")}</Text>
            <Text style={[styles.itemSub, styles.qtyCell]}>{quantity(line.quantity)}</Text>
            <Text style={[styles.itemSub, styles.rateCell]}>{money(line.unitPrice, data.currencyCode)}</Text>
            <Text style={[styles.itemSub, styles.taxCell]}>{money(line.taxAmount, data.currencyCode)}</Text>
            <Text style={[styles.itemSub, styles.amountCell]}>{money(line.amount, data.currencyCode)}</Text>
          </View>
        ))}

        <View style={styles.totalsSection} wrap={false}>
          <View style={styles.totalsTable}>
            <TotalRow label="Subtotal" value={money(data.subtotal, data.currencyCode)} />
            <TotalRow label="Discount" value={`-${money(data.discountAmount, data.currencyCode)}`} />
            <TotalRow label="Taxable amount" value={money(data.taxableAmount, data.currencyCode)} />
            {usesIgst ? (
              <TotalRow label="IGST" value={money(data.igstAmount, data.currencyCode)} />
            ) : (
              <>
                <TotalRow label="CGST" value={money(data.cgstAmount, data.currencyCode)} />
                <TotalRow label="SGST" value={money(data.sgstAmount, data.currencyCode)} />
              </>
            )}
            <TotalRow label="Shipping" value={money(data.shippingAmount, data.currencyCode)} />
            <TotalRow label="Round off" value={money(data.roundOffAmount, data.currencyCode)} />
            <TotalRow label="Total tax" value={money(data.taxAmount, data.currencyCode)} />
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand total</Text>
              <Text style={styles.grandTotalValue}>{money(data.total, data.currencyCode)}</Text>
            </View>
            <TotalRow label="Amount paid" value={money(data.amountPaid, data.currencyCode)} />
            <TotalRow label="Balance due" value={money(data.balanceDue, data.currencyCode)} />
          </View>
        </View>

        {data.notes || data.terms ? (
          <View style={styles.notesBlock} wrap={false}>
            {data.notes ? (
              <View>
                <Text style={styles.notesLabel}>NOTES</Text>
                <Text style={styles.notesText}>{data.notes}</Text>
              </View>
            ) : null}
            {data.terms ? (
              <View style={{ marginTop: data.notes ? 10 : 0 }}>
                <Text style={styles.notesLabel}>TERMS & CONDITIONS</Text>
                <Text style={styles.notesText}>{data.terms}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.signatureBlock} wrap={false}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureText}>Authorised signature</Text>
            <Text style={styles.signatureText}>{companyName}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.footer ?? safe("This is a computer-generated invoice.")}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${data.invoiceNumber} · Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
