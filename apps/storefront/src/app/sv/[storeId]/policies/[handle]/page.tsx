import { storefrontOrigin } from "@storevia/domains";
import { RichText } from "@storevia/editor/render";
import { requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storePolicyPage } from "@/lib/route-data";

// A store policy (final pass, Phase 2A): the merchant's published text,
// rendered by the allow-listed rich-text renderer. An unknown handle, or a
// policy that isn't published, is the store's 404. The contact page has a
// route of its own (../contact).

interface Props {
  params: Promise<{ storeId: string; handle: string }>;
}

async function load(params: Props["params"]) {
  const { storeId, handle } = await params;
  const store = await requestStore(storeId);
  const data = await storePolicyPage(store, handle);
  if (!data?.policy) notFound();
  return { store, policy: data.policy };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, policy } = await load(params);
  return {
    title: policy.title,
    alternates: { canonical: `${storefrontOrigin(store.canonicalHostname)}${policy.href}` },
  };
}

export default async function PolicyPage({ params }: Props) {
  const { store, policy } = await load(params);
  const updated = new Intl.DateTimeFormat([store.locale, "en"], {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(policy.publishedAt));
  return (
    <main id="main" className="sv-container sv-policy">
      <h1>{policy.title}</h1>
      <RichText doc={policy.body} />
      <p className="sv-policy-updated">Last updated {updated}</p>
    </main>
  );
}
