// Answers reflect the product as it is today (see capabilities.ts), with no
// dates for anything that isn't built.
export const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "What can I do with Storevia today?",
    answer:
      "Run an online store. Build your catalogue, design your storefront with the visual builder and a theme, connect your own domain, take payments through your Razorpay account, and manage orders, customers and your team. Everything that isn't built yet is marked on this site.",
  },
  {
    question: "What does it cost to start?",
    answer:
      "Nothing. Every organisation starts with a free allowance of one store and one team member. Paid plans add more stores, team members and features.",
  },
  {
    question: "How do I move to a paid plan?",
    answer:
      "Paid plans are set up by our team. Get in touch through the contact page and we'll help you choose.",
  },
  {
    question: "Is Storevia only for online stores?",
    answer:
      "For now, yes. Every store is set up for selling: its navigation, home and suggested team roles are built around orders, products and customers. Business websites, blogs and portfolios are on the roadmap, and you can't create them yet.",
  },
  {
    question: "Does Storevia take payments?",
    answer:
      "Your store does, through your own Razorpay account, so the money goes straight to you. Shoppers pay on Razorpay's secure page: card details never reach Storevia or your store. Cash on delivery isn't available yet.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Yes, on plans that include custom domains. Connect a domain you own with the DNS instructions in your dashboard, and HTTPS certificates are issued and renewed automatically. Every store also has its own Storevia address.",
  },
  {
    question: "What languages does my store support?",
    answer:
      "English. Your storefront and emails are in English, and you choose a regional format (such as English (India) or English (United Kingdom)) for dates and numbers.",
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
      "A plan belongs to your organisation, not to a single store. Its limits are shared by every store and team member in it.",
  },
  {
    question: "How do I move to a paid plan?",
    answer:
      "Our team sets up paid plans and trials. Choose Talk to us on a plan, tell us roughly how many stores and team members you need, and we'll reply by email.",
  },
  {
    question: "What does On the roadmap mean on a plan?",
    answer:
      "It marks a feature that isn't built yet, so you can't use it on any plan today, and we don't give dates. A plan lists it so you can see how plans differ once it exists.",
  },
  {
    question: "What happens if I reach a limit?",
    answer:
      "Everything you already have keeps working. You can't add more of that thing, such as another store or team member, until you're within the limit again or move to a plan with more room. A plan change never deletes or disables your data.",
  },
  {
    question: "Can I change or cancel my plan later?",
    answer: "Yes. Our team makes plan changes: send us a message and we'll take care of it.",
  },
];
