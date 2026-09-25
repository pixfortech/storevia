import { Icon } from "@storevia/ui";
import { Plus } from "lucide-react";
import { FAQ } from "@/content/faq";

/**
 * Questions as native disclosure widgets: keyboard and screen-reader
 * friendly, no JavaScript. The general FAQ by default; pages pass their own.
 */
export function FaqList({
  items = FAQ,
}: {
  items?: readonly { question: string; answer: string }[];
}) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 rounded-xs py-4 text-left text-body font-medium text-ink transition-colors duration-(--duration-fast) hover:text-brand-700 [&::-webkit-details-marker]:hidden">
            {item.question}
            <Icon
              icon={Plus}
              size="md"
              className="shrink-0 text-ink-faint transition-transform duration-(--duration-base) ease-(--ease-emphasised) group-open:rotate-45"
            />
          </summary>
          <p className="max-w-(--container-prose) pb-6 text-body text-ink-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
