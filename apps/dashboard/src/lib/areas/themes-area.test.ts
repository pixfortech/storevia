import { describe, expect, it } from "vitest";
import type { ShellLink } from "@/components/shell/types";
import { withThemesArea } from "./themes-area";

const link = (key: string, extra: Partial<ShellLink> = {}): ShellLink => ({
  key,
  label: key,
  href: `/s/store_1/${key}`,
  icon: "home",
  ...extra,
});

describe("withThemesArea", () => {
  it("places Themes right after Website, with Website's plan lock and schedule", () => {
    const links = [link("home"), link("website", { locked: true }), link("pages")];
    const result = withThemesArea(links, "/s/store_1/themes");
    expect(result.map((l) => l.key)).toEqual(["home", "website", "themes", "pages"]);
    expect(result[2]).toEqual({
      key: "themes",
      label: "Themes",
      href: "/s/store_1/themes",
      icon: "themes",
      soon: undefined,
      locked: true,
    });
  });

  it("adds nothing for members without Website (design.edit), and never twice", () => {
    const viewer = [link("home"), link("products"), link("settings")];
    expect(withThemesArea(viewer, "/s/store_1/themes")).toEqual(viewer);
    const once = withThemesArea([link("website")], "/s/store_1/themes");
    expect(withThemesArea(once, "/s/store_1/themes").map((l) => l.key)).toEqual([
      "website",
      "themes",
    ]);
  });
});
