// Layout pieces shared by the organisation and store settings pages: a
// sectioned page with a side index on desktop, one card per section, and a
// danger zone kept apart from everything else. Server-safe.
import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Card, CardHeader } from "@storevia/ui/surfaces";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsIndex, type SettingsSectionLink } from "./settings-index";

export type { SettingsSectionLink };

/**
 * Sections in one reading column (max 48 rem). From 1280 px a side index
 * sits to the left; below it the sections simply stack.
 */
export function SettingsLayout({
  sections,
  children,
}: {
  sections: readonly SettingsSectionLink[];
  children: ReactNode;
}) {
  return (
    <div className="xl:grid xl:grid-cols-[12rem_minmax(0,48rem)] xl:gap-14">
      <SettingsIndex sections={sections} className="hidden xl:block" />
      <div className="min-w-0 max-w-3xl space-y-6 lg:space-y-8">{children}</div>
    </div>
  );
}

/** One settings section: a card whose header names it (h2) and explains it. */
export function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className={className}>
        <CardHeader
          title={<span id={`${id}-title`}>{title}</span>}
          description={description}
          actions={actions}
        />
        {children}
      </Card>
    </section>
  );
}

/** A group of fields inside a section, under a quiet heading. */
export function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h3 className="text-overline text-ink-faint uppercase">{title}</h3>
        {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Irreversible or access-changing actions, apart from everyday settings: a
 * hairline in the danger tone, a warning icon and the word "Danger" carry
 * it (never colour alone).
 */
export function DangerZone({
  id = "danger-zone",
  description,
  children,
}: {
  id?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className="border-danger-500/30">
        <CardHeader
          icon={
            <span className="flex size-8 items-center justify-center rounded-control bg-danger-50 text-danger-600 ring-1 ring-danger-100 ring-inset">
              <Icon icon={TriangleAlert} size="sm" />
            </span>
          }
          title={<span id={`${id}-title`}>Danger zone</span>}
          description={description}
          className="border-danger-500/20"
        />
        <div className="divide-y divide-line">{children}</div>
      </Card>
    </section>
  );
}

/** One action in the danger zone: what it does on the left, its trigger on the right. */
export function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-prose text-body-sm text-ink-muted">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
