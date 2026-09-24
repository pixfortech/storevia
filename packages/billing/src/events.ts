import "server-only";

/**
 * Entitlement change notification (ADR-0022 §9). Entitlements are not cached
 * across requests, so nothing is stale after a change; apps register
 * listeners here (e.g. Next.js revalidation) and a future cache would be
 * invalidated here too. Listeners run after commit and never throw into the
 * caller.
 */
type Listener = (organisationId: string) => void | Promise<void>;

const listeners = new Set<Listener>();

export function onEntitlementsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function notifyEntitlementsChanged(organisationId: string): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener(organisationId);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "entitlement change listener failed",
          organisationId,
          errorName: error instanceof Error ? error.name : typeof error,
        }),
      );
    }
  }
}
