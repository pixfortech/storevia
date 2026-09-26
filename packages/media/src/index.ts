import "server-only";

// @storevia/media: object storage adapters, content sniffing, image
// processing and the media library service (ADR-0015, ADR-0027 §9).

export { mediaStorage, setMediaStorageForTests, storageFromEnv } from "./config";
export { LocalObjectStorage } from "./local";
export { S3ObjectStorage } from "./s3";
export type { ObjectInfo, ObjectStorage, UploadTarget } from "./storage";
export { StorageError } from "./storage";
export { contentTypeForKey, isServableKey, parseObjectKey } from "./keys";
export { MEDIA_LIMITS, precheckUpload, sniffImage } from "./sniff";
export { MediaRejectedError, processImage } from "./process";
export {
  completeMediaUpload,
  createMediaUpload,
  deleteMedia,
  getMedia,
  listMedia,
  updateMediaAlt,
} from "./service";
export type { MediaView } from "./service";
export { renditionUrls, type MediaRenditionView } from "./urls";
