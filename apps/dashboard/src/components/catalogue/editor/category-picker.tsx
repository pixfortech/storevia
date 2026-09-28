"use client";

import { Button, IconButton } from "@storevia/ui/button";
import { SearchInput } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Dialog } from "@storevia/ui/overlays";
import { Spinner } from "@storevia/ui/spinner";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { listCategoriesAction } from "@/app/(app)/s/[storeId]/products/actions";

// The product category (09-commerce.md "Categories"): one entry from the
// shared product taxonomy, chosen in a dialog. Search matches any words of
// the breadcrumb; with no search the taxonomy is browsed level by level.
// Merchants only ever see names and breadcrumbs; the code travels in a
// hidden field of the details form. "" clears the category.

export interface EditorCategory {
  readonly code: string;
  readonly path: readonly string[];
  /** false once the taxonomy retired it. */
  readonly active: boolean;
}

interface Option {
  readonly code: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly hasChildren: boolean;
}

export const breadcrumb = (path: readonly string[]) => path.join(" › ");

export function CategoryPicker({
  storeId,
  form,
  defaultCategory,
  error,
  disabled = false,
  onChange,
}: {
  storeId: string;
  /** The id of the form the hidden value belongs to. */
  form: string;
  defaultCategory: EditorCategory | null;
  error?: string | undefined;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const id = useId();
  const [category, setCategory] = useState<EditorCategory | null>(defaultCategory);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Browse position: the ancestors shown in the breadcrumb, top first. */
  const [trail, setTrail] = useState<readonly Option[]>([]);
  const [options, setOptions] = useState<readonly Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const request = useRef(0);

  const parent = trail.at(-1)?.code ?? null;
  const searching = query.trim() !== "";

  useEffect(() => {
    if (!open) return;
    const ticket = (request.current += 1);
    setLoading(true);
    const timer = setTimeout(
      () => {
        void listCategoriesAction(storeId, searching ? { q: query } : { parentCode: parent }).then(
          (result) => {
            if (ticket !== request.current) return;
            setLoading(false);
            setOptions(result.ok ? result.data : []);
            setFailure(result.ok ? null : (result.message ?? "Categories couldn't be loaded."));
          },
        );
      },
      searching ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [open, query, parent, searching, storeId]);

  const choose = (next: EditorCategory | null) => {
    setCategory(next);
    setOpen(false);
    onChange?.();
  };

  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  return (
    <div className="grid content-start gap-2" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-label text-ink">
        Category
      </p>
      <input
        type="hidden"
        name="categoryCode"
        value={category?.code ?? ""}
        form={form}
        disabled={disabled}
      />
      <p id={valueId} className="text-body-sm text-ink" data-testid="product-category">
        {category ? (
          breadcrumb(category.path)
        ) : (
          <span className="text-ink-muted">Not categorised</span>
        )}
      </p>
      {category && !category.active ? (
        <p className="text-label font-normal text-warning-700">
          This category is no longer offered. Choose another when you can.
        </p>
      ) : null}
      {error ? <p className="text-label font-normal text-danger-700">{error}</p> : null}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next) {
                setQuery("");
                setTrail([]);
              }
            }}
            title="Choose a category"
            description="Pick the closest match for what this product is. Categories are shared by every store, so they stay consistent."
            size="lg"
            trigger={
              <Button size="sm" variant="secondary" aria-describedby={valueId}>
                {category ? "Change category" : "Choose category"}
              </Button>
            }
          >
            <div className="grid gap-4">
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <SearchInput
                  aria-label="Search categories"
                  placeholder="Search, e.g. mugs or garden"
                  value={query}
                  autoFocus
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                  }}
                  onClear={() => {
                    setQuery("");
                  }}
                />
              </form>
              {searching ? null : (
                <nav aria-label="Category levels">
                  <ol className="flex flex-wrap items-center gap-1 text-body-sm">
                    <li>
                      {trail.length === 0 ? (
                        <span aria-current="location" className="font-medium text-ink">
                          All categories
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-brand-700 hover:underline"
                          onClick={() => {
                            setTrail([]);
                          }}
                        >
                          All categories
                        </button>
                      )}
                    </li>
                    {trail.map((step, index) => (
                      <li key={step.code} className="flex items-center gap-1">
                        <Icon icon={ChevronRight} size="xs" className="text-ink-faint" />
                        {index === trail.length - 1 ? (
                          <span aria-current="location" className="font-medium text-ink">
                            {step.name}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="font-medium text-brand-700 hover:underline"
                            onClick={() => {
                              setTrail(trail.slice(0, index + 1));
                            }}
                          >
                            {step.name}
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <div aria-busy={loading || undefined} className="min-h-40">
                {failure ? (
                  <p role="alert" className="text-body-sm text-danger-700">
                    {failure}
                  </p>
                ) : options.length === 0 && !loading ? (
                  <p role="status" className="py-6 text-center text-body-sm text-ink-muted">
                    {searching ? `No categories match “${query.trim()}”.` : "Nothing here."}
                  </p>
                ) : (
                  <ul
                    aria-label={searching ? "Matching categories" : "Categories"}
                    className="max-h-[min(24rem,55dvh)] divide-y divide-line overflow-y-auto rounded-control border border-line"
                  >
                    {options.map((option) => {
                      const current = option.code === category?.code;
                      const parents = option.path.slice(0, -1);
                      return (
                        <li key={option.code} className="flex items-center gap-1 pr-1">
                          <button
                            type="button"
                            aria-current={current || undefined}
                            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                            onClick={() => {
                              choose({ code: option.code, path: option.path, active: true });
                            }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body-sm font-medium text-ink">
                                {option.name}
                              </span>
                              {parents.length > 0 ? (
                                <span className="block truncate text-caption text-ink-muted">
                                  {breadcrumb(parents)}
                                </span>
                              ) : null}
                            </span>
                            {current ? (
                              <Icon
                                icon={Check}
                                size="sm"
                                className="text-brand-600"
                                label="Current category"
                              />
                            ) : null}
                          </button>
                          {option.hasChildren && !searching ? (
                            <IconButton
                              size="sm"
                              icon={ChevronRight}
                              aria-label={`Show categories in ${option.name}`}
                              onClick={() => {
                                setTrail([...trail, option]);
                              }}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {loading ? (
                  <p className="flex items-center gap-2 pt-3 text-body-sm text-ink-muted">
                    <Spinner size="sm" />
                    Loading categories…
                  </p>
                ) : null}
              </div>
            </div>
          </Dialog>
          {category ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                choose(null);
              }}
            >
              Clear category
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
