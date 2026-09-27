import "server-only";
import {
  documentRenderData,
  type CommerceRenderContext,
  type CommerceRenderSlots,
} from "@storevia/commerce/blocks";
import { createLogger, recordMetric } from "@storevia/observability";
import type { StoreRequestContext } from "@storevia/site-engine/context";
import type { RouteData } from "./route-data";

const log = createLogger({ component: "storefront" });

export function renderContext(
  store: StoreRequestContext,
  data: RouteData,
  options: {
    readonly slots: CommerceRenderSlots;
    readonly selectedVariantId?: string | null;
    readonly pageHref?: (page: number) => string;
    readonly variantHref?: (variantId: string) => string;
  },
): CommerceRenderContext {
  return {
    pageKind: data.pageKind,
    site: { name: store.name, locale: store.locale },
    data: documentRenderData(data.data, {
      product: data.product,
      collection: data.collection,
      search: data.search,
    }),
    slots: options.slots,
    selectedVariantId: options.selectedVariantId ?? null,
    pageHref: options.pageHref ?? ((page) => `?page=${String(page)}`),
    variantHref: options.variantHref ?? ((id) => `?variant=${encodeURIComponent(id)}`),
    onUnknownComponent: (type) => {
      log.warn("unknown component skipped", { storeId: store.storeId, type });
      recordMetric("storefront.unknown_component", 1, { type });
    },
    onInvalidComponent: (type) => {
      log.warn("invalid component skipped", { storeId: store.storeId, type });
      recordMetric("storefront.invalid_component", 1, { type });
    },
  };
}
