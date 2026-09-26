import { beforeAll, describe, expect, it } from "vitest";
import { editorImages } from "./media-urls";

// Local media storage, as in development: served by the dashboard itself.
// (Read when storage is first used, not at import.)
beforeAll(() => {
  process.env["STOREVIA_ENV"] = "test";
  process.env["MEDIA_STORAGE"] = "local";
  process.env["MEDIA_UPLOAD_SECRET"] = "dashboard-unit-test-media-secret-000000";
  process.env["DASHBOARD_URL"] = "http://app.localhost:3001";
});

const ORG = "0190f2a4-0000-7000-8000-000000000001";
const STORE = "0190f2a4-0000-7000-8000-000000000002";
const MEDIA = "0190f2a4-0000-7000-8000-000000000003";
const key = (name: string) => `${ORG}/${STORE}/${MEDIA}/${name}`;

describe("editor images", () => {
  it("keep every attached image, in order, with same-origin URLs", () => {
    const images = editorImages([
      {
        mediaId: "media_a",
        altText: "Mug",
        filename: "mug.jpg",
        renditions: [
          { key: key("w320.webp"), width: 320, height: 320, format: "webp", bytes: 1 },
          { key: key("w640.webp"), width: 640, height: 640, format: "webp", bytes: 1 },
        ],
      },
      // No servable rendition (processing never finished, or tampered keys):
      // it must stay listed so it can be seen and removed.
      {
        mediaId: "media_b",
        altText: null,
        filename: "broken.jpg",
        renditions: [{ key: `uploads/${ORG}/${STORE}/${MEDIA}`, width: 1, height: 1 }],
      },
    ]);
    expect(images.map((i) => i.mediaId)).toEqual(["media_a", "media_b"]);
    expect(images[0]).toMatchObject({ src: `/media/${key("w640.webp")}`, altText: "Mug" });
    expect(images[0]?.srcSet).toBe(
      `/media/${key("w320.webp")} 320w, /media/${key("w640.webp")} 640w`,
    );
    expect(images[1]).toEqual({
      mediaId: "media_b",
      altText: null,
      filename: "broken.jpg",
      src: null,
      srcSet: "",
    });
  });
});
