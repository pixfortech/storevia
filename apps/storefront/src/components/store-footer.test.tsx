import type { PolicyLinkDto, StoreIdentityDto } from "@storevia/commerce/storefront";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PolicyNote } from "../app/sv/[storeId]/checkout/parts";
import { policyMenu, StoreFooter, telHref } from "./store-footer";

// The store footer and the checkout's policy links (final pass, Phase 2A):
// built from the store's own data only, escaped, and without links to
// policies that aren't published.

const identity = (overrides: Partial<StoreIdentityDto> = {}): StoreIdentityDto => ({
  name: "Clay Studio",
  email: "help@clay.example",
  supportEmail: "help@clay.example",
  contactEmail: null,
  logo: null,
  favicon: null,
  seller: {
    legalName: "Clay Studio LLP",
    phone: "+91 80 4000 1234",
    address: ["4 Park Street", "Kolkata, West Bengal, 700016", "India"],
  },
  ...overrides,
});

const policies: PolicyLinkDto[] = [
  { kind: "REFUND", title: "Returns and refunds", href: "/policies/refunds" },
  { kind: "PRIVACY", title: "Privacy policy", href: "/policies/privacy" },
  { kind: "TERMS", title: "Terms of service", href: "/policies/terms" },
];

const footer = (props: Partial<Parameters<typeof StoreFooter>[0]> = {}) =>
  renderToStaticMarkup(
    <StoreFooter
      name="Clay Studio"
      identity={identity()}
      footerMenu={[{ key: "about", label: "About us", href: "/pages/about" }]}
      policies={policies}
      year={2026}
      {...props}
    />,
  );

describe("store footer", () => {
  it("shows the seller, how to reach them, the menus and the copyright holder", () => {
    const html = footer();
    expect(html).toContain("<address");
    expect(html).toContain("Clay Studio LLP");
    expect(html).toContain("Kolkata, West Bengal, 700016");
    expect(html).toContain('href="tel:+918040001234"');
    expect(html).toContain('href="mailto:help@clay.example"');
    expect(html).toContain('<nav aria-label="Footer">');
    expect(html).toContain('<nav aria-label="Policies">');
    expect(html).toContain('href="/policies/refunds"');
    expect(html).toContain('href="/policies/contact"');
    expect(html).toMatch(/© (<!-- -->)?2026(<!-- -->)? (<!-- -->)?Clay Studio LLP/);
    // No invented extras.
    expect(html).not.toMatch(/newsletter|subscribe|facebook|instagram/i);
  });

  it("leaves out what the merchant hasn't given", () => {
    const html = footer({
      identity: identity({
        email: null,
        supportEmail: null,
        seller: { legalName: null, phone: null, address: [] },
      }),
      footerMenu: [],
      policies: [],
    });
    expect(html).not.toContain("<address");
    expect(html).not.toContain('aria-label="Footer"');
    // The contact page is always linked; the copyright falls back to the store name.
    expect(html).toContain('href="/policies/contact"');
    expect(html).toMatch(/© (<!-- -->)?2026(<!-- -->)? (<!-- -->)?Clay Studio</);
  });

  it("escapes the merchant's text", () => {
    const html = footer({
      name: "<b>Shop</b>",
      identity: identity({
        name: "<b>Shop</b>",
        seller: {
          legalName: "<script>alert(1)</script>",
          phone: null,
          address: ['"><img src=x onerror=alert(1)>'],
        },
      }),
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Shop&lt;/b&gt;");
  });

  it("shows the logo with the store's name as its text alternative", () => {
    const html = footer({
      identity: identity({
        logo: { url: "https://media.test/logo.png", srcSet: "", width: 200, height: 80, alt: "" },
      }),
    });
    expect(html).toContain('src="https://media.test/logo.png"');
    expect(html).toContain('alt="Clay Studio"');
  });

  it("links the published policies, then the contact page by its published title", () => {
    expect(policyMenu(policies).map((l) => l.href)).toEqual([
      "/policies/refunds",
      "/policies/privacy",
      "/policies/terms",
      "/policies/contact",
    ]);
    const named = policyMenu([
      { kind: "CONTACT", title: "Get in touch", href: "/policies/contact" },
    ]);
    expect(named).toEqual([{ key: "CONTACT", label: "Get in touch", href: "/policies/contact" }]);
    expect(telHref("+91 (80) 4000-1234")).toBe("tel:+918040001234");
  });
});

describe("checkout policy links", () => {
  it("links only published policies, terms first", () => {
    const html = renderToStaticMarkup(<PolicyNote policies={policies} />);
    expect(html).toContain("By placing your order you agree to our");
    expect(html).toContain('href="/policies/terms"');
    expect(html).toContain('href="/policies/refunds"');
    expect(html).toContain('href="/policies/privacy"');
    expect(html).not.toContain("/policies/shipping");
    expect(html).toContain('target="_blank"');
  });

  it("says nothing when no policy is published", () => {
    expect(renderToStaticMarkup(<PolicyNote policies={[]} />)).toBe("");
    const onlyPrivacy = renderToStaticMarkup(
      <PolicyNote policies={policies.filter((p) => p.kind === "PRIVACY")} />,
    );
    expect(onlyPrivacy).not.toContain("agree");
    expect(onlyPrivacy).toContain("Read our");
  });
});
