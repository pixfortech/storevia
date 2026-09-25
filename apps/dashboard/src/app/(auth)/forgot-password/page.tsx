import type { Metadata } from "next";
import { ForgotPassword } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
