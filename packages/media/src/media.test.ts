import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contentTypeForKey, isServableKey, objectKey, parseObjectKey } from "./keys";
import { LocalObjectStorage } from "./local";
import { MediaRejectedError, processImage } from "./process";
import { S3ObjectStorage } from "./s3";
import { amzDate, signRequest, uriEncode } from "./sigv4";
import { precheckUpload, sniffImage } from "./sniff";

const ORG = "0190f2a4-0000-7000-8000-0000000000a1";
const STORE = "0190f2a4-0000-7000-8000-0000000000a2";
const MEDIA = "0190f2a4-0000-7000-8000-0000000000a3";
const owner = { organisationId: ORG, storeId: STORE, mediaId: MEDIA };

describe("object keys", () => {
  it("accept only server-shaped keys", () => {
    expect(parseObjectKey(`${ORG}/${STORE}/${MEDIA}/w640.webp`)).toMatchObject({
      mediaId: MEDIA,
      name: "w640.webp",
    });
    for (const bad of [
      `${ORG}/${STORE}/${MEDIA}/../../etc/passwd`,
      `${ORG}/${STORE}/../${MEDIA}/upload`,
      `/${ORG}/${STORE}/${MEDIA}/upload`,
      `${ORG}/${STORE}/${MEDIA}/upload/`,
      `${ORG}/${STORE}/${MEDIA}/shirt.jpg`,
      `${ORG}/${STORE}/${MEDIA}/original.svg`,
      `${ORG}/${STORE}/${MEDIA}/w999.webp`,
      `${ORG.toUpperCase()}/${STORE}/${MEDIA}/upload`,
      `${ORG}\\${STORE}\\${MEDIA}\\upload`,
      `${ORG}/${STORE}/${MEDIA}/%2e%2e`,
    ]) {
      expect(parseObjectKey(bad), bad).toBeNull();
    }
    expect(() => objectKey(owner, "../x")).toThrow();
  });

  it("never serve the raw upload, and serve with a type from the server-chosen name", () => {
    expect(isServableKey(`${ORG}/${STORE}/${MEDIA}/upload`)).toBe(false);
    expect(isServableKey(`${ORG}/${STORE}/${MEDIA}/original.png`)).toBe(true);
    expect(contentTypeForKey(`${ORG}/${STORE}/${MEDIA}/w320.webp`)).toBe("image/webp");
    expect(contentTypeForKey(`${ORG}/${STORE}/${MEDIA}/upload`)).toBeNull();
  });
});

describe("sniffImage", () => {
  const bytes = (...parts: (number[] | string)[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "utf8")] : p)));

  it.each([
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["PNG", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["GIF", bytes("GIF89a"), "image/gif"],
    ["WebP", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "), "image/webp"],
    ["AVIF", bytes([0, 0, 0, 0x20], "ftypavif", [0, 0, 0, 0], "mif1miaf"), "image/avif"],
  ])("recognises %s by its bytes", (_, input, mimeType) => {
    expect(sniffImage(input)).toMatchObject({ ok: true, mimeType });
  });

  it.each([
    [
      "SVG",
      bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      "svg",
    ],
    ["SVG with XML prolog", bytes('﻿  <?xml version="1.0"?><svg/>'), "svg"],
    ["HEIC", bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic"), "heic"],
    ["HTML", bytes("<!doctype html><script>"), "unknown"],
    ["a PDF", bytes("%PDF-1.7"), "unknown"],
    ["an executable", bytes([0x4d, 0x5a, 0x90, 0x00]), "unknown"],
    ["empty", new Uint8Array(), "empty"],
  ])("refuses %s", (_, input, reason) => {
    expect(sniffImage(input)).toEqual({ ok: false, reason });
  });

  it("prechecks size and obvious SVG names without trusting them", () => {
    expect(precheckUpload({ filename: "a.jpg", size: 21 * 1024 * 1024 })).toContain("20 MB");
    expect(precheckUpload({ filename: "logo.SVG", size: 10 })).toContain("SVG");
    expect(precheckUpload({ filename: "a.jpg", size: 0 })).toBe("That file is empty.");
    expect(precheckUpload({ filename: "photo.png", size: 1000 })).toBeNull();
  });
});

describe("SigV4", () => {
  // AWS's published example (S3 "GET Object", Signature Version 4 docs).
  it("matches the AWS GET Object example signature", () => {
    const headers = signRequest(
      {
        method: "GET",
        url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
        headers: { range: "bytes=0-9" },
        payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      {
        accessKeyId: "EXAMPLE-ACCESS-KEY-ID",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
      },
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(headers["authorization"]).toBe(
      "AWS4-HMAC-SHA256 Credential=EXAMPLE-ACCESS-KEY-ID/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(amzDate(new Date("2013-05-24T00:00:00Z"))).toEqual({
      dateTime: "20130524T000000Z",
      date: "20130524",
    });
    expect(uriEncode("a b/c~é", false)).toBe("a%20b/c~%C3%A9");
  });

  it("builds a POST policy pinned to one key and a size range", async () => {
    const s3 = new S3ObjectStorage({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "media",
      accessKeyId: "test",
      secretAccessKey: "test-secret-key-that-is-long-enough",
      publicBaseUrl: "https://cdn.example.test/media",
      forcePathStyle: true,
      now: () => new Date("2026-09-25T10:00:00Z"),
    });
    const target = await s3.createUploadTarget(objectKey(owner, "upload"), {
      maxBytes: 1000,
      expiresInSeconds: 600,
    });
    expect(target.url).toBe("http://localhost:9000/media/");
    const policy = JSON.parse(Buffer.from(target.fields["policy"] ?? "", "base64").toString()) as {
      expiration: string;
      conditions: unknown[];
    };
    expect(policy.expiration).toBe("2026-09-25T10:10:00.000Z");
    expect(policy.conditions).toContainEqual({ key: `${ORG}/${STORE}/${MEDIA}/upload` });
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 1000]);
    expect(s3.publicUrl(objectKey(owner, "w320.webp"))).toBe(
      `https://cdn.example.test/media/${ORG}/${STORE}/${MEDIA}/w320.webp`,
    );
    await expect(
      s3.createUploadTarget("../../x", { maxBytes: 1, expiresInSeconds: 1 }),
    ).rejects.toThrow();
  });
});

describe("local storage", () => {
  const make = (now = new Date("2026-09-25T10:00:00Z")) =>
    new LocalObjectStorage({
      root: mkdtempSync(join(tmpdir(), "storevia-media-")),
      uploadUrl: "http://app.localhost/api/media/upload",
      publicBaseUrl: "http://app.localhost/media",
      secret: "x".repeat(40),
      now: () => now,
    });

  it("issues tokens bound to one key, size and expiry", async () => {
    const storage = make();
    const key = objectKey(owner, "upload");
    const target = await storage.createUploadTarget(key, { maxBytes: 1000, expiresInSeconds: 600 });
    expect(storage.verifyUploadToken(target.fields)).toMatchObject({ key, maxBytes: 1000 });
    expect(storage.verifyUploadToken({ ...target.fields, maxBytes: "999999" })).toBeNull();
    expect(
      storage.verifyUploadToken({
        ...target.fields,
        key: objectKey({ ...owner, mediaId: STORE }, "upload"),
      }),
    ).toBeNull();
    expect(
      storage.verifyUploadToken({ ...target.fields, key: objectKey(owner, "original.png") }),
    ).toBeNull();
    expect(storage.verifyUploadToken({ ...target.fields, signature: "AAAA" })).toBeNull();
    const later = new LocalObjectStorage({
      root: tmpdir(),
      uploadUrl: "x",
      publicBaseUrl: "x",
      secret: "x".repeat(40),
      now: () => new Date("2026-09-25T10:11:00Z"),
    });
    expect(later.verifyUploadToken(target.fields)).toBeNull();
  });

  it("reads, writes and deletes only inside its root", async () => {
    const storage = make();
    const key = objectKey(owner, "w320.webp");
    await storage.write(key, new Uint8Array([1, 2, 3]));
    expect(await storage.head(key)).toEqual({ size: 3, contentType: null });
    expect(await storage.read(key, { maxBytes: 10 })).toEqual(new Uint8Array([1, 2, 3]));
    await expect(storage.read(key, { maxBytes: 2 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
    await expect(storage.write("../../escape", new Uint8Array([1]))).rejects.toMatchObject({
      code: "INVALID_KEY",
    });
  });
});

describe("processImage", () => {
  it("strips EXIF (including GPS), applies orientation and makes WebP renditions", async () => {
    const input = await sharp({
      create: { width: 1500, height: 1000, channels: 3, background: "#c33" },
    })
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Copyright: "Secret Studio" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    expect(input.includes(Buffer.from("Secret Studio"))).toBe(true);
    const out = await processImage(new Uint8Array(input));
    expect(out).toMatchObject({
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 1000,
      height: 1500,
    });
    const meta = await sharp(Buffer.from(out.original)).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.from(out.original).includes(Buffer.from("Secret Studio"))).toBe(false);
    expect(out.renditions.map((r) => [r.target, r.width])).toEqual([
      [320, 320],
      [640, 640],
      [1280, 1000],
    ]);
    for (const r of out.renditions) {
      expect(sniffImage(r.data)).toMatchObject({ ok: true, mimeType: "image/webp" });
    }
  });

  it("gives a small image one rendition at its own size", async () => {
    const input = await sharp({
      create: { width: 100, height: 50, channels: 4, background: "#0000" },
    })
      .png()
      .toBuffer();
    const out = await processImage(new Uint8Array(input));
    expect(out.renditions.map((r) => [r.target, r.width, r.height])).toEqual([[320, 100, 50]]);
  });

  it("refuses SVG, polyglots and files whose body isn't what the header claims", async () => {
    await expect(
      processImage(new Uint8Array(Buffer.from("<svg onload=alert(1)/>"))),
    ).rejects.toThrow(MediaRejectedError);
    // A PNG signature followed by HTML.
    const polyglot = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("<html><script>x</script>"),
    ]);
    await expect(processImage(new Uint8Array(polyglot))).rejects.toThrow(MediaRejectedError);
    // A JPEG body behind a GIF header.
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer();
    const disguised = Buffer.concat([Buffer.from("GIF89a"), jpeg.subarray(6)]);
    await expect(processImage(new Uint8Array(disguised))).rejects.toThrow(MediaRejectedError);
  });

  it("refuses decompression bombs by their declared size, before decoding", async () => {
    // A PNG header claiming 20000 x 20000 pixels (400 MP) with a tiny body.
    const chunk = (type: string, data: Buffer) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([length, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20_000, 0);
    ihdr.writeUInt32BE(20_000, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const bomb = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    await expect(processImage(new Uint8Array(bomb))).rejects.toThrow(/too large|couldn't be read/);
  });

  it("refuses files over 20 MB without decoding them", async () => {
    await expect(processImage(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow("20 MB");
  });
});
