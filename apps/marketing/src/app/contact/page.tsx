import { Card, CardBody } from "@storevia/ui";
import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/section";
import { ContactForm } from "./contact-form";
import { isContactTopic } from "./topics";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to the Storevia team about plans, your account or anything else.",
};

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
    <Section labelledBy="contact-title">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <SectionHeading
            as="h1"
            id="contact-title"
            eyebrow="Contact"
            title="Talk to us"
            lead="Questions about plans, help with your account or anything else: send us a message and a person will reply by email."
          />
          <dl className="mt-10 space-y-6 text-sm">
            <div>
              <dt className="font-semibold text-ink">Moving to a paid plan</dt>
              <dd className="mt-1 text-ink-muted">
                Online checkout isn&apos;t available yet, so our team sets up paid plans. Tell us
                roughly how many stores and team members you need.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Security reports</dt>
              <dd className="mt-1 text-ink-muted">
                Choose &ldquo;Report a security issue&rdquo;. Please don&apos;t include passwords or
                personal data in your message.
              </dd>
            </div>
          </dl>
        </div>
        <Card>
          <CardBody className="p-6 sm:p-8">
            <ContactForm topic={topic} message={message} />
          </CardBody>
        </Card>
      </div>
    </Section>
  );
}
