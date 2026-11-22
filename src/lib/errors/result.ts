export const ErrorCodes = {
  VALIDATION: "VALIDATION",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INVARIANT: "INVARIANT",
  CUSTOMER_INVALID: "CUSTOMER_INVALID",
  PRODUCT_INVALID: "PRODUCT_INVALID",
  EXCHANGE_RATE_MISSING: "EXCHANGE_RATE_MISSING",
  TAX_INVALID: "TAX_INVALID",
  AMOUNT_EXCEEDS_BALANCE: "AMOUNT_EXCEEDS_BALANCE",
  INFRASTRUCTURE: "INFRASTRUCTURE",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type FieldErrors = Record<string, string[]>;

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  fieldErrors?: FieldErrors,
): Result<T> {
  return { ok: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;
  readonly status: number;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is invalid.", fieldErrors?: FieldErrors) {
    super(ErrorCodes.VALIDATION, message, fieldErrors, 400);
    this.name = "ValidationError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super(ErrorCodes.UNAUTHENTICATED, "You must sign in to continue.", undefined, 401);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(ErrorCodes.FORBIDDEN, message, undefined, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(ErrorCodes.NOT_FOUND, `${resource} was not found.`, undefined, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "This record was changed by someone else. Reload and try again.") {
    super(ErrorCodes.CONFLICT, message, undefined, 409);
    this.name = "ConflictError";
  }
}

export class DomainError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, undefined, 422);
    this.name = "DomainError";
  }
}

export function toResult<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.code, error.message, error.fieldErrors);
    }
    return fail(ErrorCodes.INFRASTRUCTURE, "An unexpected error occurred. Please try again.");
  }
}

export async function toResultAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.code, error.message, error.fieldErrors);
    }
    return fail(ErrorCodes.INFRASTRUCTURE, "An unexpected error occurred. Please try again.");
  }
}
