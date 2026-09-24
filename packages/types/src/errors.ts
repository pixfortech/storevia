/**
 * Expected domain failures. They are safe to show to the user (after mapping to
 * a friendly message) and never carry internal details.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "REAUTHENTICATION_REQUIRED"
  /** The organisation's plan doesn't include this feature (ADR-0022). */
  | "ENTITLEMENT_REQUIRED"
  /** A plan limit (e.g. store_count) has been reached. */
  | "LIMIT_REACHED";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors: Readonly<Record<string, string>> | undefined;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const notFound = (): DomainError => new DomainError("NOT_FOUND", "Not found.");
export const forbidden = (): DomainError =>
  new DomainError("FORBIDDEN", "You don't have permission to do that.");
export const unauthenticated = (): DomainError =>
  new DomainError("UNAUTHENTICATED", "Please sign in to continue.");
export const conflict = (message: string): DomainError => new DomainError("CONFLICT", message);
export const validationFailed = (fieldErrors: Record<string, string>): DomainError =>
  new DomainError("VALIDATION_FAILED", "Please correct the highlighted fields.", fieldErrors);

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
