import { DomainError, validationFailed } from "@storevia/types";
import { fieldErrors } from "@storevia/validation";
import type { z } from "zod";
import { Prisma } from "@storevia/database";

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationFailed(fieldErrors(result.error));
  return result.data;
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
    return false;
  if (!field) return true;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes(field);
}

export { DomainError };
