"use client";

import { Breadcrumb, type BreadcrumbItem } from "@storevia/ui/navigation";
import Link from "next/link";

// Breadcrumb is a client component, and a server page can't hand it
// next/link as a prop, so the link component is bound here.
export function AdminBreadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  return <Breadcrumb linkAs={Link} items={items} />;
}
