export type Realm = "DASHBOARD" | "PLATFORM";

/** The authenticated identity handed to the rest of the application. */
export interface AuthSession {
  readonly sessionId: string;
  readonly realm: Realm;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly reauthenticatedAt: Date | null;
}

export interface RequestMeta {
  readonly headers: Headers;
}

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "RATE_LIMITED"
  | "WEAK_PASSWORD"
  | "INVALID_TOKEN"
  | "INVALID_INPUT";

export type AuthResult<T = undefined> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: AuthErrorCode;
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export const authOk = <T>(value: T): AuthResult<T> => ({ ok: true, value });
export const authFail = (
  code: AuthErrorCode,
  message: string,
  retryAfterSeconds?: number,
): AuthResult<never> =>
  retryAfterSeconds === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, retryAfterSeconds };
