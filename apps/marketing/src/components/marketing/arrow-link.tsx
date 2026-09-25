import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface ArrowLinkProps {
  href: string;
  children: ReactNode;
  /** A full URL outside this site (a plain <a>, e.g. the dashboard's sign-up). */
  external?: boolean;
  className?: string;
}

/** A text link with a trailing arrow that nudges on hover: "Compare every feature →". */
export function ArrowLink({ href, children, external = false, className }: ArrowLinkProps) {
  const classes = cn(
    "group/arrow inline-flex items-center gap-1.5 rounded-xs text-body-sm font-medium text-brand-700",
    "transition-colors duration-(--duration-fast) hover:text-brand-800",
    // Touch: a 44 px tall hit area without changing the line.
    "pointer-coarse:-my-3 pointer-coarse:py-3",
    className,
  );
  const content = (
    <>
      {children}
      <Icon
        icon={ArrowRight}
        size="sm"
        className="transition-transform duration-(--duration-base) ease-(--ease-emphasised) group-hover/arrow:translate-x-0.5"
      />
    </>
  );
  return external ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
