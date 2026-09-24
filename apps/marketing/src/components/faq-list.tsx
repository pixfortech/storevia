import { ICON_STROKE } from "@storevia/ui";
import { Plus } from "lucide-react";
import { FAQ } from "@/content/faq";

/** Native disclosure widgets: keyboard and screen-reader friendly, no JS. */
export function FaqList() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {FAQ.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus
              aria-hidden="true"
              strokeWidth={ICON_STROKE}
              className="size-5 shrink-0 text-ink-faint transition-transform duration-(--duration-base) group-open:rotate-45"
            />
          </summary>
          <p className="max-w-(--container-prose) pb-5 text-ink-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
