import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DomainError, ErrorCodes } from "@/lib/errors/result";
import { requireHttpsUrl } from "@/lib/security/urls";

type StorageProvider = "S3" | "SUPABASE";

interface SupabaseConfig {
  url: string;
  bucket: string;
  serviceRoleKey: string;
}

const bucket = process.env.INVOICE_PDF_BUCKET;
const prefix = (process.env.INVOICE_PDF_PREFIX ?? "invoices").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_REGION;
const primary = process.env.PDF_STORAGE_PRIMARY?.trim().toUpperCase() === "SUPABASE" ? "SUPABASE" : "S3";

let s3Client: S3Client | undefined;

function supabaseConfig(): SupabaseConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !supabaseBucket || !serviceRoleKey) return null;
  try {
    const url = process.env.NODE_ENV === "production"
      ? requireHttpsUrl(rawUrl, "SUPABASE_URL")
      : new URL(rawUrl).toString().replace(/\/+$/, "");
    return { url, bucket: supabaseBucket, serviceRoleKey };
  } catch {
    return null;
  }
}

function s3Configured(): boolean {
  return Boolean(bucket && region);
}

export function getInvoicePdfStorageStatus(): {
  configured: boolean;
  primary: StorageProvider;
  providers: { s3: boolean; supabase: boolean };
} {
  const providers = { s3: s3Configured(), supabase: Boolean(supabaseConfig()) };
  return {
    configured: providers.s3 || providers.supabase,
    primary,
    providers,
  };
}

export function isInvoicePdfStorageConfigured(): boolean {
  return getInvoicePdfStorageStatus().configured;
}

function requiredS3Bucket(): string {
  if (!bucket || !region) {
    throw new DomainError(
      ErrorCodes.INFRASTRUCTURE,
      "S3 PDF storage is not configured. Set AWS_REGION and INVOICE_PDF_BUCKET.",
    );
  }
  return bucket;
}

function getS3Client(): S3Client {
  const configuredBucket = requiredS3Bucket();
  if (!s3Client) {
    s3Client = new S3Client({ region: region! });
  }
  void configuredBucket;
  return s3Client;
}

function orderedProviders(): StorageProvider[] {
  const status = getInvoicePdfStorageStatus();
  const available: StorageProvider[] = [];
  if (status.providers[primary.toLowerCase() as "s3" | "supabase"]) available.push(primary);
  const fallback: StorageProvider = primary === "S3" ? "SUPABASE" : "S3";
  if (status.providers[fallback.toLowerCase() as "s3" | "supabase"]) available.push(fallback);
  return available;
}

function parseStoredKey(key: string): {
  provider: StorageProvider;
  bucket: string;
  objectKey: string;
  explicit: boolean;
} {
  if (key.startsWith("supabase://")) {
    const remainder = key.slice("supabase://".length);
    const separator = remainder.indexOf("/");
    if (separator > 0) {
      return {
        provider: "SUPABASE",
        bucket: remainder.slice(0, separator),
        objectKey: remainder.slice(separator + 1),
        explicit: true,
      };
    }
  }
  if (key.startsWith("s3://")) {
    const remainder = key.slice("s3://".length);
    const separator = remainder.indexOf("/");
    if (separator > 0) {
      return {
        provider: "S3",
        bucket: remainder.slice(0, separator),
        objectKey: remainder.slice(separator + 1),
        explicit: true,
      };
    }
  }
  return { provider: "S3", bucket: bucket ?? "", objectKey: key, explicit: false };
}

function encodeObjectKey(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function supabaseHeaders(config: SupabaseConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
  };
}

function sanitizeProviderError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown storage error.";
}

async function storeSupabasePdf(config: SupabaseConfig, objectKey: string, bytes: Buffer): Promise<void> {
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=0, no-store",
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage returned ${response.status}: ${detail.slice(0, 300)}`);
  }
}

async function signSupabasePdf(
  config: SupabaseConfig,
  objectKey: string,
  expiresIn: number,
): Promise<string> {
  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: "POST",
      headers: { ...supabaseHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage signing returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { signedURL?: string; token?: string };
  if (!payload.signedURL) throw new Error("Supabase Storage did not return a signed URL.");
  const path = payload.signedURL.startsWith("/") ? payload.signedURL : `/${payload.signedURL}`;
  return `${config.url}/storage/v1${path}`;
}

export async function verifyInvoicePdfStorage(): Promise<Record<string, { ok: boolean; detail: string }>> {
  const result: Record<string, { ok: boolean; detail: string }> = {};

  if (s3Configured()) {
    try {
      await getS3Client().send(new HeadBucketCommand({ Bucket: requiredS3Bucket() }));
      result.s3 = { ok: true, detail: "bucket reachable" };
    } catch (error) {
      result.s3 = { ok: false, detail: sanitizeProviderError(error) };
    }
  }

  const config = supabaseConfig();
  if (config) {
    try {
      const response = await fetch(
        `${config.url}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`,
        {
          headers: supabaseHeaders(config),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        },
      );
      result.supabase = {
        ok: response.ok,
        detail: response.ok ? "bucket reachable" : `HTTP ${response.status}`,
      };
    } catch (error) {
      result.supabase = { ok: false, detail: sanitizeProviderError(error) };
    }
  }

  return result;
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
  const parsed = parseStoredKey(key);
  if (parsed.provider === "SUPABASE") {
    const resolvedBucket = parsed.bucket || supabaseConfig()?.bucket;
    if (!resolvedBucket) {
      throw new DomainError(ErrorCodes.INFRASTRUCTURE, "Supabase Storage is not configured.");
    }
    return `supabase://${resolvedBucket}/${parsed.objectKey}`;
  }
  const resolvedBucket = parsed.bucket || requiredS3Bucket();
  return `s3://${resolvedBucket}/${parsed.objectKey}`;
}

export async function storeInvoicePdf(key: string, bytes: Buffer): Promise<string> {
  const providers = orderedProviders();
  if (!providers.length) {
    throw new DomainError(
      ErrorCodes.INFRASTRUCTURE,
      "PDF storage is not configured. Configure S3 or Supabase Storage.",
    );
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      if (provider === "S3") {
        await getS3Client().send(new PutObjectCommand({
          Bucket: requiredS3Bucket(),
          Key: key,
          Body: bytes,
          ContentType: "application/pdf",
          CacheControl: "private, max-age=0, no-store",
          ServerSideEncryption: "AES256",
        }));
        return key;
      }

      const config = supabaseConfig();
      if (!config) throw new Error("Supabase Storage is not configured.");
      await storeSupabasePdf(config, key, bytes);
      return `supabase://${config.bucket}/${key}`;
    } catch (error) {
      failures.push(`${provider}: ${sanitizeProviderError(error)}`);
    }
  }

  throw new DomainError(ErrorCodes.INFRASTRUCTURE, `PDF upload failed. ${failures.join(" | ")}`);
}

export async function getInvoicePdfUrl(input: {
  key: string;
  filename: string;
  disposition: "inline" | "attachment";
  expiresIn?: number;
}): Promise<string> {
  const parsed = parseStoredKey(input.key);
  const expiresIn = input.expiresIn ?? 120;
  const responseContentDisposition = `${input.disposition}; filename="${input.filename.replace(/"/g, "")}.pdf"`;

  if (parsed.provider === "SUPABASE") {
    const config = supabaseConfig();
    if (!config) throw new DomainError(ErrorCodes.INFRASTRUCTURE, "Supabase Storage is not configured.");
    return signSupabasePdf(config, parsed.objectKey, expiresIn);
  }

  if (s3Configured()) {
    const command = new GetObjectCommand({
      Bucket: parsed.bucket || requiredS3Bucket(),
      Key: parsed.objectKey,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: responseContentDisposition,
    });
    return getSignedUrl(getS3Client(), command, { expiresIn });
  }

  const config = supabaseConfig();
  if (config) return signSupabasePdf(config, parsed.objectKey, expiresIn);

  throw new DomainError(ErrorCodes.INFRASTRUCTURE, "PDF storage is not configured.");
}
