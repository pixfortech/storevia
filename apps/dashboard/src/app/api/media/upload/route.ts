import { LocalObjectStorage, mediaStorage, MEDIA_LIMITS } from "@storevia/media";
import { NextResponse, type NextRequest } from "next/server";

// Upload endpoint for local media storage (development and tests only; with
// S3 the browser posts straight to the bucket). A signed, short-lived token
// names the one key this request may write and its size limit; nothing about
// the tenant is taken from the request. The bytes are only stored here:
// completing the upload (a server action) sniffs, decodes and cleans them.

export const runtime = "nodejs";

const FORM_OVERHEAD = 64 * 1024;

export async function POST(request: NextRequest): Promise<Response> {
  const storage = mediaStorage();
  if (!(storage instanceof LocalObjectStorage)) {
    return new NextResponse(null, { status: 404 });
  }
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(declared) || declared > MEDIA_LIMITS.maxBytes + FORM_OVERHEAD) {
    return NextResponse.json({ error: "Images can be up to 20 MB." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const fields: Record<string, unknown> = {};
  for (const name of ["key", "maxBytes", "expires", "signature"]) fields[name] = form.get(name);
  const token = storage.verifyUploadToken(fields);
  if (!token) return NextResponse.json({ error: "This upload link has expired." }, { status: 403 });
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size === 0 || file.size > token.maxBytes) {
    return NextResponse.json({ error: "Images can be up to 20 MB." }, { status: 413 });
  }
  await storage.write(token.key, new Uint8Array(await file.arrayBuffer()));
  return new NextResponse(null, { status: 204 });
}
