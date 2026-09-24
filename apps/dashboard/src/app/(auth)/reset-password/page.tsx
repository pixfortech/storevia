import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams)["token"] ?? "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">You'll be signed out everywhere else.</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
