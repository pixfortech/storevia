// Commerce as it's being built: a product with variants, stock by location
// and its media, in the dashboard's layout. Commerce is in development, so
// this previews the direction with sample content (the section around it
// shows each part's status). Responds to its own width.
import { Button } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Badge } from "@storevia/ui/surfaces";
import { ChevronRight, ImagePlus, MapPin } from "lucide-react";
import { Mockup, WindowFrame } from "./frame";
import { ProductArt } from "./product-art";

const VARIANTS = [
  { name: "Chalk · 12 oz", sku: "MUG-CH-12", price: "$28.00", stock: 42 },
  { name: "Chalk · 16 oz", sku: "MUG-CH-16", price: "$32.00", stock: 18 },
  { name: "Moss · 12 oz", sku: "MUG-MO-12", price: "$28.00", stock: 6 },
  { name: "Moss · 16 oz", sku: "MUG-MO-16", price: "$32.00", stock: 0 },
] as const;

const LOCATIONS = [
  { name: "Studio", units: 24 },
  { name: "Warehouse", units: 42 },
] as const;

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return (
      <Badge tone="danger" size="sm">
        Out of stock
      </Badge>
    );
  if (stock < 10)
    return (
      <Badge tone="warning" size="sm">
        Low
      </Badge>
    );
  return null;
}

export function ProductEditor({ className }: { className?: string }) {
  return (
    <Mockup
      label="Illustration: a product in the Storevia dashboard with four variants, stock by location and media. Commerce is in development; the content is sample data."
      className={className}
    >
      <WindowFrame className="h-full">
        <div className="@container/product flex h-full flex-col bg-surface">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
              <span className="text-ink-muted">Products</span>
              <Icon icon={ChevronRight} size="xs" className="text-neutral-400" />
              <span className="truncate font-medium text-ink">Stoneware mug</span>
            </span>
            <Badge tone="success" dot size="sm" className="hidden @md/product:inline-flex">
              Active
            </Badge>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" className="hidden @lg/product:inline-flex">
                Preview
              </Button>
              <Button size="sm">Save</Button>
            </span>
          </div>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 @xl/product:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="min-w-0 space-y-4">
              <div className="flex gap-3.5">
                <div className="flex size-18 shrink-0 items-center justify-center rounded-control bg-surface-sunken">
                  <ProductArt kind="mug" className="size-14" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[17px] font-semibold tracking-[-0.015em] text-ink">
                    Stoneware mug
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                    Wheel-thrown, glazed inside and out. Dishwasher safe.
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge size="sm" variant="outline">
                      Kitchen
                    </Badge>
                    <Badge size="sm" variant="outline">
                      Autumn collection
                    </Badge>
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-card border border-line">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <p className="text-[12.5px] font-semibold text-ink">Variants</p>
                  <p className="text-[11px] text-ink-faint">Colour × Size</p>
                </div>
                <Table dense aria-label="Variants" className="text-[12px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead className="hidden @3xl/product:table-cell">SKU</TableHead>
                      <TableHead numeric>Price</TableHead>
                      <TableHead numeric>Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VARIANTS.map((variant) => (
                      <TableRow key={variant.sku}>
                        <TableCell className="font-medium">{variant.name}</TableCell>
                        <TableCell className="hidden font-mono text-[11px] text-ink-muted @3xl/product:table-cell">
                          {variant.sku}
                        </TableCell>
                        <TableCell numeric>{variant.price}</TableCell>
                        <TableCell numeric>
                          <span className="inline-flex items-center gap-2">
                            <StockBadge stock={variant.stock} />
                            {variant.stock}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="hidden min-w-0 space-y-4 @xl/product:block">
              <div className="rounded-card border border-line p-3.5">
                <p className="text-[12.5px] font-semibold text-ink">Stock by location</p>
                <ul className="mt-2.5 space-y-2.5">
                  {LOCATIONS.map((location) => (
                    <li key={location.name}>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <Icon icon={MapPin} size="xs" className="text-ink-faint" />
                          {location.name}
                        </span>
                        <span className="font-medium text-ink tabular-nums">{location.units}</span>
                      </div>
                      <span className="mt-1.5 block h-1 rounded-pill bg-muted">
                        <span
                          className="block h-full rounded-pill bg-brand-500"
                          style={{ width: `${String((location.units / 66) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-card border border-line p-3.5">
                <p className="text-[12.5px] font-semibold text-ink">Media</p>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-sm bg-surface-sunken",
                        index === 0 && "ring-2 ring-brand-500 ring-offset-1",
                      )}
                    >
                      <ProductArt
                        kind="mug"
                        className={cn("size-3/4", index > 0 && "scale-x-[-1]")}
                      />
                    </span>
                  ))}
                  <span className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-line-strong text-ink-faint">
                    <Icon icon={ImagePlus} size="sm" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </WindowFrame>
    </Mockup>
  );
}
