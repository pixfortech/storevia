import { generateToken } from "@storevia/security";
import { DomainError } from "@storevia/types";

export function conflict(message: string, fieldErrors?: Record<string, string>): DomainError {
  return new DomainError("CONFLICT", message, fieldErrors);
}

export function generateTokenSafe(): string {
  return generateToken(32);
}
