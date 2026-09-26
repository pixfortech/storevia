// Cache tags (ADR-0028 §9, ADR-0029). Public data is cached under these, and
// the worker turns outbox events into them. The Site Engine owns the tag
// grammar and its own tags; a composition (Storevia commerce) adds its
// namespaces and event mappings, and composes the two.
//
//   store:{storeId}      everything cached for a site
//   pages:{storeId}      published content pages
//   host:{hostname}      one host resolution (in-process resolver cache)

export type CacheTag = `${string}:${string}`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAMESPACE_RE = /^[a-z][a-z-]{1,30}$/;

/** The Site Engine's own id-keyed namespaces (`host:` is keyed by hostname). */
export const SITE_TAG_NAMESPACES = ["store", "pages"] as const;

export const storeTag = (storeId: string): CacheTag => `store:${storeId}`;
export const pagesTag = (storeId: string): CacheTag => `pages:${storeId}`;
export const hostTag = (hostname: string): CacheTag => `host:${hostname}`;

/**
 * A predicate for well-formed tags: `{namespace}:{uuid}` for the given
 * namespaces, or `host:{hostname}`. Anything else (unknown namespaces,
 * malformed ids, whitespace) is refused.
 */
export function cacheTagGrammar(
  namespaces: readonly string[],
): (value: unknown) => value is CacheTag {
  for (const ns of namespaces) {
    if (!NAMESPACE_RE.test(ns) || ns === "host")
      throw new Error(`invalid cache tag namespace ${ns}`);
  }
  const re = new RegExp(`^(?:(?:${namespaces.join("|")}):${UUID}|host:[a-z0-9.-]{1,253})$`);
  return (value: unknown): value is CacheTag => typeof value === "string" && re.test(value);
}

/** The Site Engine's own tags only. */
export const isSiteCacheTag = cacheTagGrammar(SITE_TAG_NAMESPACES);

export interface OutboxEventLike {
  readonly type: string;
  readonly storeId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: unknown;
}

/** Maps an event to tags, or returns null when the event isn't this mapper's. */
export type EventTagMapper = (event: OutboxEventLike) => CacheTag[] | null;

/** Site events (pages, domains, the store and its organisation); anything unknown invalidates the whole site. */
export function siteCacheTagsForEvent(event: OutboxEventLike): CacheTag[] {
  switch (event.type) {
    case "page.changed":
      return [pagesTag(event.storeId)];
    case "domain.changed": {
      const hostnames =
        typeof event.payload === "object" && event.payload !== null
          ? (event.payload as { hostnames?: unknown }).hostnames
          : undefined;
      const hosts = Array.isArray(hostnames)
        ? hostnames.filter((h): h is string => typeof h === "string").map(hostTag)
        : [];
      return [storeTag(event.storeId), ...hosts];
    }
    default:
      return [storeTag(event.storeId)];
  }
}

/** The composition's mappers first, then the Site Engine's (which handles everything else). */
export function composeEventTags(...mappers: readonly EventTagMapper[]) {
  return (event: OutboxEventLike): CacheTag[] => {
    for (const mapper of mappers) {
      const tags = mapper(event);
      if (tags) return tags;
    }
    return siteCacheTagsForEvent(event);
  };
}
