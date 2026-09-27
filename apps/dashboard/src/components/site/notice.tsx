"use client";

import { Alert } from "@storevia/ui/surfaces";

// Inline feedback for the website editors: announced politely to screen
// readers, dismissable, and never the only record of an error (the fields
// keep their own messages).

export interface Notice {
  readonly tone: "success" | "danger";
  readonly title: string;
}

export function StatusNotice({
  notice,
  onDismiss,
  className,
}: {
  notice: Notice | null;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {notice ? (
        <Alert tone={notice.tone} onDismiss={onDismiss}>
          {notice.title}
        </Alert>
      ) : null}
    </div>
  );
}
