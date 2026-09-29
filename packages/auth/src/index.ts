export { hashPassword, verifyPassword } from "./password";
export { AuthService, hasRecentAuth } from "./service";
export type {
  AuthServiceOptions,
  PendingEmailChange,
  SessionSummary,
  SignInResult,
} from "./service";
export { maskEmail } from "./email-change";
export * from "./types";
