import "server-only";
import { isDomainError } from "@storevia/types";
import { unstable_rethrow } from "next/navigation";
import { requestId } from "./request";

export interface ActionState {
  readonly ok: boolean;
  readonly message?: string | undefined;
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
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors, values };
    }
    const id = await requestId();
    console.error(
      JSON.stringify({
        level: "error",
        msg: "server action failed",
        requestId: id,
        error: String(error),
      }),
    );
    return {
      ok: false,
      message: `Something went wrong on our side. Please try again.${id ? ` (Reference: ${id})` : ""}`,
      values,
    };
  }
}
