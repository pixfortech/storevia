// Example content shared by the surfaces gallery's live overlays (demos.tsx)
// and their static previews (page.tsx), so both always show the same thing.
// No hooks: it renders on the server and inside client components. Every
// name, store and address here is example data.
import {
  Avatar,
  Badge,
  DescriptionList,
  Field,
  Icon,
  Input,
  Select,
  type CommandItem,
} from "@storevia/ui";
import {
  CreditCard,
  House,
  Package,
  Palette,
  Plus,
  Settings,
  ShoppingBag,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

/* --- Command menu ------------------------------------------------------------------- */

export const COMMAND_ITEMS: CommandItem[] = [
  { id: "home", label: "Home", group: "Northwind Studio", icon: <Icon icon={House} /> },
  { id: "orders", label: "Orders", group: "Northwind Studio", icon: <Icon icon={ShoppingBag} /> },
  { id: "products", label: "Products", group: "Northwind Studio", icon: <Icon icon={Package} /> },
  {
    id: "website",
    label: "Website",
    group: "Northwind Studio",
    // An area that isn't built yet says so, in the sidebar's word.
    hint: "Soon",
    icon: <Icon icon={Palette} />,
  },
  {
    id: "members",
    label: "Members",
    group: "Northwind Ltd",
    keywords: ["team", "invite"],
    icon: <Icon icon={Users} />,
  },
  {
    id: "billing",
    label: "Plan and billing",
    group: "Northwind Ltd",
    keywords: ["usage", "invoice"],
    icon: <Icon icon={CreditCard} />,
  },
  {
    id: "new-product",
    label: "New product",
    group: "Create",
    keywords: ["add"],
    icon: <Icon icon={Plus} />,
  },
  {
    id: "outlet",
    label: "Northwind Outlet",
    group: "Stores",
    hint: "Northwind Ltd",
    icon: <Icon icon={Store} />,
  },
];

/* --- Dialog, Drawer and Sheet bodies ---------------------------------------------- */

export const INVITE = {
  title: "Invite a teammate",
  description: "They get an email with a link that works for 7 days.",
};

export function InviteFields() {
  return (
    <div className="space-y-4">
      <Field label="Email address">
        <Input type="email" placeholder="name@company.example" />
      </Field>
      <Field label="Role">
        <Select defaultValue="editor">
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </Select>
      </Field>
    </div>
  );
}

/** Who or what a confirmation is about, in a quiet well. */
export function Subject({
  name,
  detail,
  shape = "circle",
}: {
  name: string;
  detail: string;
  shape?: "circle" | "square";
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-subtle px-3 py-2.5">
      <Avatar name={name} shape={shape} />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{name}</p>
        <p className="truncate text-caption text-ink-faint">{detail}</p>
      </div>
    </div>
  );
}

export const MEMBER_DETAILS = {
  title: "Member details",
  description: "Jonas Weber’s role, store access and sign-in.",
};

export function MemberDetails() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name="Jonas Weber" size="lg" />
        <div className="min-w-0">
          <p className="font-medium text-ink">Jonas Weber</p>
          <p className="truncate text-caption text-ink-faint">jonas@northwind.example</p>
        </div>
      </div>
      <DescriptionList
        className="mt-6"
        items={[
          { term: "Role", detail: "Admin" },
          { term: "Stores", detail: "Northwind Studio, Northwind Outlet, Journal" },
          { term: "Joined", detail: "4 March 2026" },
          { term: "Two-step sign-in", detail: <Badge tone="success">On</Badge> },
        ]}
      />
    </>
  );
}

const NAV: readonly (readonly [LucideIcon, string])[] = [
  [House, "Home"],
  [ShoppingBag, "Orders"],
  [Package, "Products"],
  [Palette, "Website"],
  [Users, "Members"],
  [Settings, "Settings"],
];

export function ExampleNav() {
  return (
    <nav aria-label="Example sections">
      <ul className="-mx-2 space-y-0.5">
        {NAV.map(([glyph, label], index) => {
          const current = index === 0;
          return (
            <li key={label}>
              <a
                href="#overlays"
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "flex h-10 items-center gap-3 rounded-control bg-brand-50 px-2.5 text-body-sm font-medium text-brand-700"
                    : "flex h-10 items-center gap-3 rounded-control px-2.5 text-body-sm text-ink-muted hover:bg-subtle hover:text-ink"
                }
              >
                <Icon icon={glyph} size="nav" />
                {label}
                {label === "Website" ? (
                  <Badge size="sm" className="ml-auto">
                    Soon
                  </Badge>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function FilterFields() {
  return (
    <div className="space-y-5">
      <Field label="Status">
        <Select defaultValue="any">
          <option value="any">Any status</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
        </Select>
      </Field>
      <Field label="Customer">
        <Input placeholder="Name or email" />
      </Field>
      <p className="text-caption text-ink-faint">Example filters; nothing is applied.</p>
    </div>
  );
}
