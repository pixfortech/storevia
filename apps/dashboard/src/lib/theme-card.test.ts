import { describe, expect, it } from "vitest";
import { themeBadges, themeCardActions, themeCardNote, themeLayoutFacts } from "./theme-card";

const base = {
  installed: false,
  live: false,
  previewing: false,
  hasUnpublishedChanges: false,
  revision: null as number | null,
  incompatibility: null as string | null,
};
const all = { canEdit: true, canPublish: true };

const STATES = {
  "not installed": base,
  installed: { ...base, installed: true, revision: 0, hasUnpublishedChanges: true },
  "installed and previewing": {
    ...base,
    installed: true,
    previewing: true,
    revision: 2,
    hasUnpublishedChanges: true,
  },
  live: { ...base, installed: true, live: true, previewing: true, revision: 3 },
  "live with changes": {
    ...base,
    installed: true,
    live: true,
    previewing: true,
    revision: 4,
    hasUnpublishedChanges: true,
  },
};

const summary = (entry: typeof base, permissions = all) =>
  themeCardActions(entry, permissions).map((a) => `${a.label}:${a.kind}`);

describe("theme card actions", () => {
  it("always come in the same order, whatever the state and permissions", () => {
    for (const entry of Object.values(STATES)) {
      for (const permissions of [
        all,
        { canEdit: true, canPublish: false },
        { canEdit: false, canPublish: false },
      ]) {
        expect(themeCardActions(entry, permissions).map((a) => a.key)).toEqual([
          "demo",
          "install",
          "customise",
          "preview",
          "publish",
        ]);
      }
    }
  });

  it("follow the theme's state", () => {
    expect(summary(STATES["not installed"])).toEqual([
      "View demo:link",
      "Install:button",
      "Customise:disabled",
      "Preview on my store:disabled",
      "Make live:disabled",
    ]);
    expect(summary(STATES.installed)).toEqual([
      "View demo:link",
      "Installed:disabled",
      "Customise:link",
      "Preview on my store:button",
      "Make live:button",
    ]);
    expect(summary(STATES["installed and previewing"])).toEqual([
      "View demo:link",
      "Installed:disabled",
      "Customise:link",
      "Preview on my store:external",
      "Make live:button",
    ]);
    expect(summary(STATES.live)).toEqual([
      "View demo:link",
      "Installed:disabled",
      "Customise:link",
      "Preview on my store:external",
      "Publish:disabled",
    ]);
    expect(summary(STATES["live with changes"]).at(-1)).toBe("Publish:button");
  });

  it("follow permissions: theme.publish to make live, design.edit to change anything", () => {
    const noPublish = { canEdit: true, canPublish: false };
    expect(summary(STATES.installed, noPublish).at(-1)).toBe("Make live:disabled");
    expect(summary(STATES["live with changes"], noPublish).at(-1)).toBe("Publish:disabled");
    expect(summary(STATES["not installed"], { canEdit: false, canPublish: false })).toEqual([
      "View demo:link",
      "Install:disabled",
      "Customise:disabled",
      "Preview on my store:disabled",
      "Make live:disabled",
    ]);
    // A theme this platform can't use can only be looked at.
    const incompatible = { ...STATES.installed, incompatibility: "Built for another engine." };
    expect(summary(incompatible)).toEqual([
      "View demo:link",
      "Installed:disabled",
      "Customise:link",
      "Preview on my store:disabled",
      "Make live:disabled",
    ]);
  });
});

describe("theme card badges and notes", () => {
  it("write every state out", () => {
    const labels = (entry: typeof base) => themeBadges(entry).map((b) => b.label);
    expect(labels(STATES["not installed"])).toEqual(["Not installed"]);
    expect(labels(STATES.installed)).toEqual(["Installed"]);
    expect(labels(STATES["installed and previewing"])).toEqual(["Installed", "Previewing"]);
    expect(labels(STATES.live)).toEqual(["Live"]);
    expect(labels(STATES["live with changes"])).toEqual(["Live", "Unpublished changes"]);
  });

  it("explain what can't be used yet", () => {
    expect(themeCardNote(STATES["not installed"], all)).toMatch(/^Install it/);
    expect(themeCardNote(STATES.installed, { canEdit: true, canPublish: false })).toMatch(
      /can't publish themes/,
    );
    expect(themeCardNote(STATES.installed, all)).toBeNull();
  });

  it("describe the layout the miniature shows", () => {
    expect(
      themeLayoutFacts({
        header: "centred",
        navigation: "uppercase",
        footer: "centred",
        productCard: "portrait",
        productPage: "gallery",
      }),
    ).toEqual([
      "Name centred above the menu",
      "uppercase menu",
      "tall portrait product cards",
      "gallery product page",
    ]);
  });
});
