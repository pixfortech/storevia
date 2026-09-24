import { buttonClasses } from "@storevia/ui";
import Link from "next/link";
import { appLinks } from "@/lib/env";
import { Container } from "./section";

export function CtaBand({
  title = "Start building your online presence",
  lead = "Create your organisation and first store in a few minutes. Free to start, no card needed.",
}: {
  title?: string;
  lead?: string;
}) {
  return (
    <section aria-labelledby="cta-heading" className="py-16 sm:py-20">
      <Container>
        <div className="rounded-panel bg-stone-900 px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2
            id="cta-heading"
            className="text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-300">{lead}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={appLinks().signUp} className={buttonClasses("primary", "lg")}>
              Start free
            </a>
            <Link href="/contact" className={buttonClasses("inverse", "lg")}>
              Talk to us
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
