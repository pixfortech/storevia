import { storefrontOrigin } from "@storevia/domains";
import { RichText } from "@storevia/editor/render";
import { requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTACT_PATH, telHref } from "@/components/store-footer";
import { CONTACT_HANDLE, storePolicyPage } from "@/lib/route-data";

// The contact page (final pass, Phase 2A): every store has one. It shows
// the store's name, who the seller is, the business address, phone and
// emails as the merchant entered them, and the published contact policy's
// text (support hours and the like) when there is one.

interface Props {
  params: Promise<{ storeId: string }>;
}

async function load(params: Props["params"]) {
  const store = await requestStore((await params).storeId);
  const data = await storePolicyPage(store, CONTACT_HANDLE);
  if (!data) notFound();
  return { store, ...data, title: data.policy?.title ?? "Contact us" };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, title } = await load(params);
  return {
    title,
    alternates: { canonical: `${storefrontOrigin(store.canonicalHostname)}${CONTACT_PATH}` },
  };
}

export default async function ContactPage({ params }: Props) {
  const { store, identity, policy, title } = await load(params);
  const name = identity?.name ?? store.name;
  const seller = identity?.seller;
  const support = identity?.supportEmail ?? null;
  const contact = identity?.contactEmail ?? null;
  return (
    <main id="main" className="sv-container sv-policy">
      <h1>{title}</h1>
      <dl className="sv-contact-details" data-testid="contact-details">
        <div>
          <dt>Store</dt>
          <dd>{name}</dd>
        </div>
        {seller?.legalName ? (
          <div>
            <dt>Sold by</dt>
            <dd>{seller.legalName}</dd>
          </div>
        ) : null}
        {seller && seller.address.length > 0 ? (
          <div>
            <dt>Address</dt>
            <dd>
              <address className="sv-contact-address">
                {seller.address.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </address>
            </dd>
          </div>
        ) : null}
        {seller?.phone ? (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={telHref(seller.phone)}>{seller.phone}</a>
            </dd>
          </div>
        ) : null}
        {support ? (
          <div>
            <dt>Customer support</dt>
            <dd>
              <a href={`mailto:${support}`}>{support}</a>
            </dd>
          </div>
        ) : null}
        {contact && contact !== support ? (
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${contact}`}>{contact}</a>
            </dd>
          </div>
        ) : null}
      </dl>
      {policy ? <RichText doc={policy.body} /> : null}
    </main>
  );
}
