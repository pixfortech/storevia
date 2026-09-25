// A static, inert render of the open command menu (galleries and product
// visuals). Server-safe, so a page that shows it ships no command-menu code.
import { cn } from "./cn";
import {
  CommandEmpty,
  CommandFooter,
  CommandRow,
  commandResults,
  GROUP_LABEL,
  PANEL,
  SearchRow,
  type CommandItem,
} from "./command-parts";

export interface CommandMenuPreviewProps {
  items: readonly CommandItem[];
  /** Text in the search field; it filters the items as typing would. */
  query?: string;
  /** The highlighted result. Default: the first. */
  activeId?: string;
  placeholder?: string;
  className?: string;
}

/**
 * A static, inert render of the open command menu for galleries and product
 * visuals: the live menu's parts, without the dialog, and hidden from
 * assistive technology.
 */
export function CommandMenuPreview({
  items,
  query = "",
  activeId,
  placeholder = "Search or jump to…",
  className,
}: CommandMenuPreviewProps) {
  const groups = commandResults(items, query);
  const results = groups.flatMap((group) => group.items);
  const current = results.find((item) => item.id === activeId) ?? results[0];
  return (
    <div inert aria-hidden="true" className={cn(PANEL, "w-full max-w-160 text-left", className)}>
      <SearchRow>
        <span
          className={cn(
            "flex h-15 min-w-0 flex-1 items-center truncate text-body",
            query ? "text-ink" : "text-ink-faint",
          )}
        >
          {query || placeholder}
        </span>
      </SearchRow>
      <div className="p-2">
        {results.length === 0 ? (
          <CommandEmpty query={query} />
        ) : (
          groups.map((group) => (
            <div key={group.name} className="not-first:mt-1">
              <div className={GROUP_LABEL}>{group.name}</div>
              {group.items.map((item) => (
                <CommandRow key={item.id} item={item} selected={item === current} />
              ))}
            </div>
          ))
        )}
      </div>
      <CommandFooter count={results.length} />
    </div>
  );
}
