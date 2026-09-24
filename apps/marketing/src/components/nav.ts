export const PRIMARY_NAV = [
  { label: "Products", href: "/products" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "Company", href: "/about" },
] as const;

export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/products" },
      { label: "Teams and roles", href: "/products#teams" },
      { label: "Commerce", href: "/products#commerce" },
      { label: "Website builder", href: "/products#builder" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Online stores", href: "/solutions#online-stores" },
      { label: "Business websites", href: "/solutions#business-websites" },
      { label: "Blogs and publications", href: "/solutions#publications" },
      { label: "Portfolios", href: "/solutions#portfolios" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Roadmap", href: "/resources#roadmap" },
      { label: "Security", href: "/resources#security" },
      { label: "Frequently asked", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
] as const;
