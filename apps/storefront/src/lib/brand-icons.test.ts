import { describe, expect, it } from "vitest";
import { smallestRendition, storeIcons } from "./brand-icons";

const M = "http://app.localhost:3001/media/o/s/m";

describe("store favicon links", () => {
  it("use the smallest rendition, whatever the srcset order", () => {
    expect(smallestRendition(`${M}/w640.webp 640w, ${M}/w320.webp 320w`)).toBe(`${M}/w320.webp`);
    expect(smallestRendition("")).toBeNull();
    expect(smallestRendition(`${M}/w640.webp, ${M}/x.webp bogus`)).toBeNull();
  });

  it("an icon and an apple-touch-icon, or nothing without a favicon", () => {
    expect(
      storeIcons({ url: `${M}/w640.webp`, srcSet: `${M}/w320.webp 320w, ${M}/w640.webp 640w` }),
    ).toEqual({
      icon: [{ url: `${M}/w320.webp`, type: "image/webp" }],
      apple: [{ url: `${M}/w320.webp`, type: "image/webp" }],
    });
    // A small image has one rendition at its own width.
    expect(storeIcons({ url: `${M}/w320.webp`, srcSet: `${M}/w320.webp 48w` })).toMatchObject({
      icon: [{ url: `${M}/w320.webp` }],
    });
    expect(storeIcons(null)).toBeUndefined();
    expect(storeIcons(undefined)).toBeUndefined();
  });
});
