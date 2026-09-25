import { Illustration, type IllustrationName } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import type { ReactNode } from "react";

/**
 * A whole page the member can't use (their role or plan doesn't allow it):
 * one illustration, the reason as the heading and what to do next. It shows
 * no data and offers no controls beyond an optional link.
 */
export function AccessNotice({
  title,
  children,
  illustration = "locked-feature",
  action,
}: {
  title: string;
  children: ReactNode;
  illustration?: IllustrationName;
  action?: ReactNode;
}) {
  return (
    <Card className="max-w-3xl">
      <EmptyState
        illustration={<Illustration name={illustration} size="sm" />}
        title={title}
        description={children}
        action={action}
      />
    </Card>
  );
}
