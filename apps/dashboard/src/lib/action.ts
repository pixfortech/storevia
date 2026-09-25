import "server-only";
import { createLogger } from "@storevia/observability";
import { isDomainError } from "@storevia/types";
import { unstable_rethrow } from "next/navigation";
import { requestId } from "./request";

const log = createLogger({ app: "dashboard" });

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
    // Redacted; error messages are never logged (some echo input values).
    log.error("server action failed", { requestId: id, error });
    return {
      ok: false,
      message: `Something went wrong on our side. Please try again.${id ? ` (Reference: ${id})` : ""}`,
      values,
    };
  }
}

/** An action that returns data (for editors that call actions directly, not through a form). */
export type DataActionResult<T> =
  | (ActionState & { readonly ok: false })
  | { readonly ok: true; readonly data: T; readonly message?: string };

export async function runDataAction<T>(
  fn: () => Promise<T>,
  message?: string,
): Promise<DataActionResult<T>> {
  let data: T | undefined;
  const state = await runAction(async () => {
    data = await fn();
    return { ok: true };
  });
  if (!state.ok) return { ...state, ok: false };
  return { ok: true, data: data as T, ...(message ? { message } : {}) };
}
