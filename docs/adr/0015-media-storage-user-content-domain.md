# ADR-0015: Media in S3-compatible storage, served from a user-content domain

- Status: Accepted
- Date: 2026-09-24

## Decision

- Uploads go **directly to object storage** with short-lived, single-object
  signed POST policies (size range + content type), issued after
  `authorize(ctx, "media.manage")` and quota checks.
- Object keys are server-generated (`{organisationId}/{storeId}/{mediaId}/…`).
  User filenames are metadata only.
- After upload, the worker verifies type by **magic bytes**, rejects
  mismatches, strips metadata (EXIF GPS), sanitises or rasterises SVG, and
  generates responsive renditions (AVIF/WebP) with pixel-count limits.
- Media is served from `media.storeviausercontent.com` (separate registrable
  domain) via CDN with `nosniff` and safe content types.
- The storage interface lives in `packages/media` (S3 API; MinIO locally).

## Consequences

- App servers never proxy large uploads; uploaded content can't script
  against Storevia origins.
- An asynchronous `PROCESSING` state is visible in the UI.
