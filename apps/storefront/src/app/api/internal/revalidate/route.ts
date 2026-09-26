import { isStorefrontCacheTag } from "@storevia/commerce/storefront/cache-tags";
import { revalidateSecret } from "@storevia/site-engine/env";
import { handleRevalidation } from "@storevia/site-engine/revalidate";

// Cache invalidation from the worker (ADR-0028 §9, ADR-0029): the Site
// Engine's signed protocol, accepting the Site Engine's and commerce's tags.
export function POST(request: Request): Promise<Response> {
  return handleRevalidation(request, { secret: revalidateSecret(), isTag: isStorefrontCacheTag });
}
