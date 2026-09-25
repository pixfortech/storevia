// Publishing as it's planned: a post being written, with its author,
// categories, featured image and a search preview. Content tools are on the
// roadmap (the roles for authors and editors already exist), so this is a
// concept with sample content. Responds to its own width.
import { Button } from "@storevia/ui/button";
import { Icon } from "@storevia/ui/icons";
import { Avatar, Badge } from "@storevia/ui/surfaces";
import { ChevronRight, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { Mockup, WindowFrame } from "./frame";
import { ProductArt } from "./product-art";
import { SAMPLE_PERSON } from "./sample-data";

const TITLE = "A field guide to slow mornings";
const EXCERPT =
  "Five small rituals from the studio for starting the day with more attention and less hurry.";

function Aside({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="border-b border-line px-3.5 py-3 last:border-b-0">
      <p className="text-[9.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function PostEditor({ className }: { className?: string }) {
  return (
    <Mockup
      label="Illustration: writing a post in Storevia, with its author, categories, featured image and search preview. Content tools are on the roadmap; the post is sample content."
      className={className}
    >
      <WindowFrame className="h-full">
        <div className="@container/post flex h-full flex-col bg-surface">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
              <span className="text-ink-muted">Posts</span>
              <Icon icon={ChevronRight} size="xs" className="text-neutral-400" />
              <span className="truncate font-medium text-ink">{TITLE}</span>
            </span>
            <Badge size="sm" variant="dot" className="hidden shrink-0 @md/post:inline-flex">
              Draft
            </Badge>
            <span className="ml-auto flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" className="hidden @lg/post:inline-flex">
                Preview
              </Button>
              <Button size="sm">Publish</Button>
            </span>
          </div>
          <div className="flex min-h-0 flex-1">
            <article className="min-w-0 flex-1 overflow-hidden px-5 py-5 @2xl/post:px-8">
              <p className="text-[10.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase">
                Guides
              </p>
              <p className="mt-1.5 font-display text-[22px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink @2xl/post:text-[26px]">
                {TITLE}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-muted">
                <Avatar name={SAMPLE_PERSON.name} size="xs" />
                <span className="font-medium text-ink">{SAMPLE_PERSON.name}</span>
                <span aria-hidden="true">·</span>
                <span>6 min read</span>
              </div>
              <div className="mt-4 flex aspect-[21/8] items-end justify-center rounded-control bg-surface-sunken pt-3">
                <ProductArt kind="vase" className="h-[92%] w-auto" />
                <ProductArt kind="mug" className="-ml-[4%] h-[64%] w-auto" />
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">
                The first hour sets the pace for the rest of the day. In the studio we keep it
                quiet: kettle on, windows open, no screens until the clay is wedged.
                <span className="ml-0.5 inline-block h-[1.1em] w-px translate-y-[0.2em] bg-brand-600" />
              </p>
              <p className="mt-3 font-display text-[14px] font-semibold text-ink">
                1. Make one thing by hand
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                A cup of coffee counts. So does a sketch, a loaf or a line of writing.
              </p>
            </article>
            <aside className="hidden w-[14rem] shrink-0 border-l border-line @xl/post:block">
              <Aside title="Author">
                <span className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                  <Avatar name={SAMPLE_PERSON.name} size="xs" />
                  {SAMPLE_PERSON.name}
                </span>
              </Aside>
              <Aside title="Categories">
                <span className="flex flex-wrap gap-1.5">
                  <Badge size="sm" tone="brand">
                    Guides
                  </Badge>
                  <Badge size="sm" variant="outline">
                    Studio
                  </Badge>
                </span>
              </Aside>
              <Aside title="Search preview">
                <div className="rounded-control border border-line p-2.5">
                  <p className="flex items-center gap-1 truncate text-[10px] text-ink-faint">
                    <Icon icon={Globe} size="xs" className="size-3" />
                    northwind.example › journal
                  </p>
                  <p className="mt-1 text-[12px] leading-snug font-medium text-brand-700">
                    {TITLE}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-ink-muted">
                    {EXCERPT}
                  </p>
                </div>
              </Aside>
            </aside>
          </div>
        </div>
      </WindowFrame>
    </Mockup>
  );
}
