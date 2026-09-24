import "server-only";
import { createLogger } from "@storevia/observability";
import { isDomainError } from "@storevia/types";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

const log = createLogger({ app: "platform-admin" });

export interface ActionState {
  readonly ok: boolean;
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly fieldErrors?: Readonly<Record<string, string>> | undefined;
  readonly values?: Readonly<Record<string, string>> | undefined;
}

export const initialActionState: ActionState = { ok: false };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && !/password/i.test(key))
      values[key] = value;
  }
  return values;
}

/** Plain object of string form fields, for service input parsing. */
export function formObject(formData: FormData): Record<string, string> {
  return formValues(formData);
}

/**
 * Runs a server action body. Expected failures become a serialisable state;
 * unexpected errors are logged (redacted, no message) with the request ID.
 */
export async function runAction(
  fn: () => Promise<ActionState>,
  formData?: FormData,
): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    const values = formData ? formValues(formData) : undefined;
    if (isDomainError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        values,
      };
    }
    const requestId = (await headers()).get("x-request-id") ?? undefined;
    log.error("server action failed", { requestId, error });
    return {
      ok: false,
      message: `Something went wrong. Please try again.${requestId ? ` (Reference: ${requestId})` : ""}`,
      values,
    };
  }
}
