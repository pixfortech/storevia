// Themes as its own store area (08-themes.md §10.7): listed right after
// Website, for exactly the members who have Website (the same design.edit
// permission, the same plan feature and lock). Themes are part of the
// website offering, so they aren't a business-type area of their own; this
// only places the link. The Themes pages check design.edit themselves.
import type { ShellLink } from "@/components/shell/types";

export function withThemesArea(links: readonly ShellLink[], themesHref: string): ShellLink[] {
  const index = links.findIndex((link) => link.key === "website");
  const website = links[index];
  if (!website || links.some((link) => link.key === "themes")) return [...links];
  const themes: ShellLink = {
    key: "themes",
    label: "Themes",
    href: themesHref,
    icon: "themes",
    soon: website.soon,
    locked: website.locked,
  };
  return [...links.slice(0, index + 1), themes, ...links.slice(index + 1)];
}
