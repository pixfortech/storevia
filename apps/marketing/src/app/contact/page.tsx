import { Card, CardBody, Icon } from "@storevia/ui";
import { CreditCard, LifeBuoy, ShieldAlert, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, SectionHeading } from "@/components/marketing";
import { ContactForm } from "./contact-form";
import { isContactTopic } from "./topics";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to the Storevia team about plans, your account or anything else.",
};

const TOPICS: readonly {
  icon: LucideIcon;
  title: string;
  body: string;
  link: { label: string; href: string };
}[] = [
  {
    icon: CreditCard,
    title: "Moving to a paid plan",
    body: "Online checkout isn't available yet, so our team sets up paid plans and trials. Tell us roughly how many stores and team members you need.",
    link: { label: "Compare plans", href: "/pricing" },
  },
  {
    icon: LifeBuoy,
    title: "Help with your account",
    body: "Say which organisation or store it's about and what you were trying to do. Never send your password.",
    link: { label: "See what's available today", href: "/features" },
  },
  {
    icon: ShieldAlert,
    title: "Reporting a security issue",
    body: "Choose Report a security issue as the topic, and please don't include personal data in your message.",
    link: { label: "How we protect your data", href: "/resources#security" },
  },
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = typeof params["topic"] === "string" ? params["topic"] : "";
  const topic = isContactTopic(requested) ? requested : "plans";
  // A plan name only pre-fills the message; it's shown back to the visitor as text.
  const plan = typeof params["plan"] === "string" ? params["plan"].slice(0, 60) : "";
  const message = plan ? `I'd like to know more about the ${plan} plan.` : "";
  return (
    <section
      aria-labelledby="contact-title"
      className="pt-14 pb-18 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28"
    >
      <Container>
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div className="min-w-0">
            <SectionHeading
              as="h1"
              id="contact-title"
              eyebrow="Contact"
              title="Talk to us"
              lead="Questions about plans, help with your account or anything else: send a message and a person on the team will reply by email."
            />
            <ul className="mt-12 divide-y divide-line border-y border-line">
              {TOPICS.map((item) => (
                <li key={item.title} className="flex gap-4 py-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-card border border-line bg-surface">
                    <Icon icon={item.icon} size="md" className="text-ink" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-body font-semibold text-ink">{item.title}</h2>
                    <p className="mt-1 text-body-sm text-ink-muted">{item.body}</p>
                    <Link
                      href={item.link.href}
                      className="mt-2 inline-block text-body-sm font-medium text-brand-700 underline-offset-4 hover:underline pointer-coarse:-my-2 pointer-coarse:py-2"
                    >
                      {item.link.label}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Card className="self-start shadow-raised">
            <CardBody className="p-6 sm:p-8 lg:p-10">
              <h2 className="font-display text-h3 text-ink">Send us a message</h2>
              <p className="mt-1.5 text-body-sm text-ink-muted">
                Fields marked with an asterisk are required.
              </p>
              <div className="mt-8">
                <ContactForm topic={topic} message={message} />
              </div>
            </CardBody>
          </Card>
        </div>
      </Container>
    </section>
  );
}
