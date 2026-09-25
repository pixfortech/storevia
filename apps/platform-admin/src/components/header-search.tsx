"use client";

import { buttonClasses } from "@storevia/ui/button";
import { SearchInput } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Organisation search from anywhere in the tool: a field on wide screens, a
 * search button linking to the organisations list (which has its own search)
 * at every narrower width, phones included. Hidden on the list itself so
 * there is one search per page.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/organisations") return null;
  return (
    <>
      <Form
        action="/organisations"
        role="search"
        aria-label="Organisation search"
        className="hidden xl:block"
      >
        <SearchInput
          name="q"
          aria-label="Search organisations"
          placeholder="Search organisations"
          className="w-64"
        />
      </Form>
      <Link
        href="/organisations"
        aria-label="Search organisations"
        className={buttonClasses("ghost", "md", "w-10 px-0 xl:hidden pointer-coarse:size-11")}
      >
        <Icon icon={Search} size="md" />
      </Link>
    </>
  );
}
