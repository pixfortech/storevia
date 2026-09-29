import type { PolicyLinkDto, StoreIdentityDto } from "@storevia/commerce/storefront";
import { SiteMenu, type MenuLink } from "@storevia/site-engine/shell";

// The store's footer (final pass, Phase 2A), from its own data: the name (or
// logo), who the seller is and how to reach them, the footer menu, the
// published policies and the contact page, and a copyright line. Nothing
// is invented: a detail the merchant hasn't given is left out. Server
// component, no client JavaScript; text is escaped by React.

/** The contact page is always there; a published contact policy names its link. */
export const CONTACT_PATH = "/policies/contact";

/** A tel: link target: the digits and a leading plus only. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^+0-9]/g, "")}`;

/** The seller's legal name, address, phone and email as an <address>, or nothing when none is set. */
export function SellerAddress({
  identity,
  className,
}: {
  identity: StoreIdentityDto | null;
  className?: string;
}) {
  const seller = identity?.seller;
  const email = identity?.email ?? null;
  const lines = seller?.address ?? [];
  if (!seller?.legalName && lines.length === 0 && !seller?.phone && !email) return null;
  return (
    <address className={className}>
      {seller?.legalName ? <span className="sv-seller-name">{seller.legalName}</span> : null}
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
      {seller?.phone ? <a href={telHref(seller.phone)}>{seller.phone}</a> : null}
      {email ? <a href={`mailto:${email}`}>{email}</a> : null}
    </address>
  );
}

/** Footer links to the published policies, then the contact page. */
export function policyMenu(policies: readonly PolicyLinkDto[]): MenuLink[] {
  const contact = policies.find((p) => p.kind === "CONTACT");
  return [
    ...policies
      .filter((p) => p.kind !== "CONTACT")
      .map((p) => ({ key: p.kind, label: p.title, href: p.href })),
    { key: "CONTACT", label: contact?.title ?? "Contact us", href: CONTACT_PATH },
  ];
}

export function StoreFooter({
  name,
  identity,
  footerMenu,
  policies,
  year = new Date().getFullYear(),
}: {
  /** The store's name (the identity's, else the request's). */
  name: string;
  identity: StoreIdentityDto | null;
  footerMenu: readonly MenuLink[];
  policies: readonly PolicyLinkDto[];
  year?: number;
}) {
  const logo = identity?.logo ?? null;
  const owner = identity?.seller.legalName ?? name;
  return (
    <div className="sv-container sv-store-footer">
      <div className="sv-footer-columns">
        <div className="sv-footer-identity">
          <p className="sv-footer-brand">
            {logo ? (
              <img
                className="sv-footer-logo"
                src={logo.url}
                {...(logo.srcSet ? { srcSet: logo.srcSet, sizes: "12rem" } : {})}
                {...(logo.width && logo.height ? { width: logo.width, height: logo.height } : {})}
                alt={name}
                loading="lazy"
              />
            ) : (
              name
            )}
          </p>
          <SellerAddress identity={identity} className="sv-footer-address" />
        </div>
        <SiteMenu label="Footer" links={footerMenu} />
        <SiteMenu label="Policies" links={policyMenu(policies)} />
      </div>
      <p className="sv-footer-legal">
        © {year} {owner}
      </p>
    </div>
  );
}
