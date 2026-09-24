import "server-only";
import { isDomainError } from "@storevia/types";
import { unstable_rethrow } from "next/navigation";
import { requestId } from "./request";

export interface ActionState {
  readonly ok: boolean;
  readonly message?: string | undefined;
  /** Machine-readable error code (e.g. REAUTHENTICATION_REQUIRED). */
  readonly code?: string | undefined;
  readonly fieldErrors?: Readonly<Record<string, string>> | undefined;
  /** Echoed form values so fields keep their input after a failed submit. */
  readonly values?: Readonly<Record<string, string>> | undefined;
}

export const initialActionState: ActionState = { ok: false };

/**
 * Log shape for unexpected errors: type, code and stack frames only. Error
 * messages are omitted because some (e.g. database validation errors) echo
 * argument values such as emails.
 */
function describeError(error: unknown, requestId: string | undefined) {
  const base = { level: "error", msg: "server action failed", requestId };
  if (!(error instanceof Error)) return { ...base, errorType: typeof error };
  const code = (error as { code?: unknown }).code;
  return {
    ...base,
    errorName: error.name,
    ...(typeof code === "string" ? { errorCode: code } : {}),
    stack: error.stack
      ?.split("\n")
      .slice(1, 8)
      .map((line) => line.trim()),
  };
}

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && !/password/i.test(key))
      values[key] = value;
  }
  return values;
}

/**
 * Runs a server action body and turns expected failures into a friendly,
 * serialisable state. Unexpected errors are logged server-side with the
 * request ID; the user only sees a generic message and that ID.
 */
export async function runAction(
  fn: () => Promise<ActionState>,
  formData?: FormData,
): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error); // let redirect()/notFound() propagate
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
    const id = await requestId();
    console.error(JSON.stringify(describeError(error, id)));
    return {
      ok: false,
      message: `Something went wrong on our side. Please try again.${id ? ` (Reference: ${id})` : ""}`,
      values,
    };
  }
}
