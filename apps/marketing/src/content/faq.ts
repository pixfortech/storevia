// Answers reflect the product as it is today (see capabilities.ts).
export const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Can I use Storevia today?",
    answer:
      "Yes, to set up your organisation, your stores and your team. Storevia is in active development: the storefront, product catalogue and visual builder arrive over the coming releases, and every feature on this site shows its status.",
  },
  {
    question: "What does it cost to start?",
    answer:
      "Nothing. Every organisation starts with a free allowance of one store and one team member. Paid plans add more stores, team members and features.",
  },
  {
    question: "How do I move to a paid plan?",
    answer:
      "Online checkout isn't available yet, so paid plans are set up by our team. Get in touch through the contact page and we'll help you choose.",
  },
  {
    question: "What is a business type, and can I change it?",
    answer:
      "When you create a store you tell us what you're building: an online store, a business website, a publication or a portfolio. Storevia shapes navigation, your store's home and suggested team roles around it. You can change it at any time and nothing is deleted. It never changes your plan or anyone's permissions.",
  },
  {
    question: "Does Storevia take payments?",
    answer:
      "Not yet. Checkout, payments and orders are on the roadmap. Until then Storevia doesn't process any payments.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Custom domains are on the roadmap. Each store already reserves its own Storevia web address for when storefronts launch.",
  },
  {
    question: "How is my data kept separate from other businesses?",
    answer:
      "Every organisation's data is isolated in the database itself, not only in application code, and access is checked on every request against your membership and role. Sensitive changes ask you to confirm your password.",
  },
];

// Pricing questions (/pricing). Plan details stay in the catalogue: nothing
// here names a price or a limit.
export const PRICING_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Is there a free plan?",
    answer:
      "Yes. Every organisation starts on the free allowance, with no card needed. The Free column shows exactly what it includes.",
  },
  {
    question: "What does a plan cover?",
    answer:
      "A plan belongs to your organisation, not to a single store. Its limits are shared by every store and team member in it, whatever each store's business type.",
  },
  {
    question: "How do I move to a paid plan?",
    answer:
      "Online checkout isn't available yet, so our team sets up paid plans and trials. Choose Talk to us on a plan, tell us roughly how many stores and team members you need, and we'll reply by email.",
  },
  {
    question: "What do Up next and On the roadmap mean on a plan?",
    answer:
      "They mark features that aren't built yet: Up next is the next milestone we build, On the roadmap comes after it. Each plan already records whether it includes them, and the product enforces what the plan records, so you can use a feature on your plan as soon as it ships.",
  },
  {
    question: "What happens if I reach a limit?",
    answer:
      "Everything you already have keeps working. You can't add more of that thing, such as another store or team member, until you're within the limit again or move to a plan with more room. A plan change never deletes or disables your data.",
  },
  {
    question: "Can I change or cancel my plan later?",
    answer:
      "Yes. For now our team makes plan changes: send us a message and we'll take care of it. Choosing and changing plans yourself arrives with online checkout.",
  },
];
