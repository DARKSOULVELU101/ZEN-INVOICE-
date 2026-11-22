import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DomainError, ErrorCodes } from "@/lib/errors/result";

const bucket = process.env.INVOICE_PDF_BUCKET;
const prefix = (process.env.INVOICE_PDF_PREFIX ?? "invoices").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_REGION;

let client: S3Client | undefined;

function requiredBucket(): string {
  if (!bucket || !region) {
    throw new DomainError(
      ErrorCodes.INFRASTRUCTURE,
      "PDF storage is not configured. Set AWS_REGION and INVOICE_PDF_BUCKET.",
    );
  }
  return bucket;
}

function getClient(): S3Client {
  requiredBucket();
  client ??= new S3Client({ region });
  return client;
}

export function isInvoicePdfStorageConfigured(): boolean {
  return Boolean(bucket && region);
}

export function buildInvoicePdfKey(input: {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  version: number;
  hash: string;
}): string {
  const safeNumber = input.invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${prefix}/${input.organizationId}/${input.invoiceId}/${safeNumber}-v${input.version}-${input.hash.slice(0, 12)}.pdf`;
}

export function buildInvoicePdfUri(key: string): string {
  return `s3://${requiredBucket()}/${key}`;
}

export async function storeInvoicePdf(key: string, bytes: Buffer): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: requiredBucket(),
    Key: key,
    Body: bytes,
    ContentType: "application/pdf",
    CacheControl: "private, max-age=0, no-store",
    ServerSideEncryption: "AES256",
  }));
}

export async function getInvoicePdfUrl(input: {
  key: string;
  filename: string;
  disposition: "inline" | "attachment";
  expiresIn?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requiredBucket(),
    Key: input.key,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: `${input.disposition}; filename="${input.filename.replace(/"/g, "")}.pdf"`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: input.expiresIn ?? 120 });
}
