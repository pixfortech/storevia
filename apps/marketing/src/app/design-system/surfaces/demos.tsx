"use client";

// Interactive specimens for the surfaces gallery. All names, stores and
// figures are example data, and nothing here changes anything.
import { Button, IconButton } from "@storevia/ui/button";
import { CommandMenu, useCommandShortcut } from "@storevia/ui/command";
import {
  Kbd,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSort,
} from "@storevia/ui/data";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPreview,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@storevia/ui/dropdown-menu";
import { Icon } from "@storevia/ui/icons";
import { Dialog, DialogClose, Drawer, Sheet } from "@storevia/ui/overlays";
import { Alert, Avatar, Badge } from "@storevia/ui/surfaces";
import {
  Archive,
  Copy,
  Ellipsis,
  Globe,
  Link2,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Store,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  COMMAND_ITEMS,
  ExampleNav,
  FilterFields,
  INVITE,
  InviteFields,
  MEMBER_DETAILS,
  MemberDetails,
  Subject,
} from "./examples";

/* --- Alerts --------------------------------------------------------------------- */

/**
 * Dismissing unmounts the alert and its focused button, so focus moves on to
 * the "Show again" button, and back to the alert's Dismiss when it returns.
 */
export function DismissibleAlertDemo() {
  const [open, setOpen] = useState(true);
  const region = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    region.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  return (
    <div ref={region}>
      {open ? (
        <Alert
          tone="neutral"
          title="Your domain is connected"
          onDismiss={() => {
            moveFocus.current = true;
            setOpen(false);
          }}
        >
          It can take up to an hour for every visitor to see the new address.
        </Alert>
      ) : (
        <div className="flex min-h-[74px] items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 text-body-sm text-ink-muted">
          Dismissed. Focus moved here, not to the top of the page.
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              moveFocus.current = true;
              setOpen(true);
            }}
          >
            Show again
          </Button>
        </div>
      )}
    </div>
  );
}

/* --- Confirmation -------------------------------------------------------------------- */

/**
 * A destructive confirmation: an alertdialog (no dismissing by clicking
 * outside; focus starts on Cancel). Opened from a menu item, it hands focus
 * back to the menu's trigger when it closes.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** A polite line under a demo, e.g. "Example only: nothing was removed." */
function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="min-h-4 text-caption text-ink-faint">
      {children}
    </p>
  );
}

/* --- Table ------------------------------------------------------------------------ */

interface Member {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  status: "Active" | "Invited" | "Expired";
  stores: number;
  lastActive: string;
}

const MEMBERS: readonly Member[] = [
  {
    id: "m1",
    name: "Amara Okafor",
    email: "amara@northwind.example",
    role: "Owner",
    status: "Active",
    stores: 3,
    lastActive: "Today",
  },
  {
    id: "m2",
    name: "Jonas Weber",
    email: "jonas@northwind.example",
    role: "Admin",
    status: "Active",
    stores: 3,
    lastActive: "Yesterday",
  },
  {
    id: "m3",
    name: "Priya Raman",
    email: "priya@northwind.example",
    role: "Editor",
    status: "Active",
    stores: 2,
    lastActive: "3 days ago",
  },
  {
    id: "m4",
    name: "Tom Ellis",
    email: "tom@northwind.example",
    role: "Viewer",
    status: "Invited",
    stores: 1,
    lastActive: "—",
  },
  {
    id: "m5",
    name: "Sofia Marin",
    email: "sofia@northwind.example",
    role: "Editor",
    status: "Expired",
    stores: 1,
    lastActive: "—",
  },
];

const STATUS_TONE = { Active: "success", Invited: "info", Expired: "warning" } as const;

type SortKey = "name" | "stores";

// Secondary detail folds away on phones (design plan §11–12).
const SECONDARY = "max-md:hidden";

export function MembersTableDemo() {
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<TableSort, "none"> }>({
    key: "name",
    dir: "ascending",
  });
  // The member stays set while the dialog fades out, so its title doesn't change mid-exit.
  const [removing, setRemoving] = useState<Member | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const rows = useMemo(() => {
    const sorted = [...MEMBERS].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name) : a.stores - b.stores,
    );
    return sort.dir === "ascending" ? sorted : sorted.reverse();
  }, [sort]);
  const sortProps = (key: SortKey) => ({
    sort: sort.key === key ? sort.dir : ("none" as const),
    onSort: () => {
      setSort((s) => ({
        key,
        dir: s.key === key && s.dir === "ascending" ? "descending" : "ascending",
      }));
    },
  });
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Table stickyHeader maxHeight="16rem" className="min-w-[560px]">
          <TableCaption>Team members (example data), sortable by name and stores</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead {...sortProps("name")}>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead numeric {...sortProps("stores")}>
                Stores
              </TableHead>
              <TableHead className={SECONDARY}>Last active</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{m.name}</div>
                      <div className="truncate text-caption text-ink-faint">{m.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-ink-muted">{m.role}</TableCell>
                <TableCell>
                  <Badge variant="dot" tone={STATUS_TONE[m.status]}>
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell numeric>{m.stores}</TableCell>
                <TableCell className={`text-ink-muted ${SECONDARY}`}>{m.lastActive}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton icon={Ellipsis} size="sm" aria-label={`Actions for ${m.name}`} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem icon={Pencil}>Change role</DropdownMenuItem>
                      <DropdownMenuItem icon={Store}>Store access</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        icon={Trash2}
                        tone="danger"
                        disabled={m.role === "Owner"}
                        onSelect={() => {
                          setRemoving(m);
                          setConfirmOpen(true);
                        }}
                      >
                        Remove from team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DemoNote>{note}</DemoNote>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${removing?.name ?? "this member"}?`}
        description="They lose access to every store in Northwind Ltd straight away. Anything they created stays."
        confirmLabel="Remove"
        onConfirm={() => {
          setNote(`Example only: ${removing?.name ?? "nobody"} was not removed.`);
        }}
      >
        <Subject
          name={removing?.name ?? ""}
          detail={removing ? `${removing.role} · ${removing.email}` : ""}
        />
      </ConfirmDialog>
    </div>
  );
}

/* --- Dropdown menu ------------------------------------------------------------------ */

export function DropdownMenuDemo() {
  const [archived, setArchived] = useState(false);
  const [compact, setCompact] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" trailingIcon={Ellipsis}>
            Store actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Northwind Studio</DropdownMenuLabel>
          <DropdownMenuItem icon={Pencil} shortcut="E">
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem icon={Copy} shortcut="⌘D">
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem icon={Link2}>Copy store address</DropdownMenuItem>
          <DropdownMenuItem icon={Globe} disabled>
            Connect a domain (Soon)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={archived}
            onCheckedChange={setArchived}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            Show archived
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={compact}
            onCheckedChange={setCompact}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            Compact rows
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Archive}>Archive store</DropdownMenuItem>
          <DropdownMenuItem
            icon={Trash2}
            tone="danger"
            onSelect={() => {
              setConfirm(true);
            }}
          >
            Delete store
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DemoNote>{note}</DemoNote>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete Northwind Studio?"
        description="Its products, pages and website are deleted for everyone. This can’t be undone."
        confirmLabel="Delete store"
        onConfirm={() => {
          setNote("Example only: nothing was deleted.");
        }}
      >
        <Subject name="Northwind Studio" detail="northwind.storevia.site" shape="square" />
      </ConfirmDialog>
    </div>
  );
}

/** The open menu as a static picture, under a stand-in for its trigger. */
export function DropdownMenuPreviewDemo() {
  return (
    <div inert aria-hidden="true" className="flex flex-col items-start gap-1.5">
      <Button variant="secondary" trailingIcon={Ellipsis} tabIndex={-1}>
        Store actions
      </Button>
      <DropdownMenuPreview
        className="w-60"
        items={[
          { type: "label", label: "Northwind Studio" },
          { label: "Edit details", icon: Pencil, shortcut: "E" },
          { label: "Duplicate", icon: Copy, shortcut: "⌘D", highlighted: true },
          { label: "Copy store address", icon: Link2 },
          { label: "Connect a domain (Soon)", icon: Globe, disabled: true },
          { type: "separator" },
          { type: "label", label: "View" },
          { type: "checkbox", label: "Show archived" },
          { type: "checkbox", label: "Compact rows", checked: true },
          { type: "separator" },
          { label: "Archive store", icon: Archive },
          { label: "Delete store", icon: Trash2, tone: "danger" },
        ]}
      />
    </div>
  );
}

/* --- Dialog, Drawer, Sheet ---------------------------------------------------------- */

export function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <>
      <Button
        variant="danger-outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Remove member
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove Priya Raman?"
        description="They lose access to Northwind Studio straight away. Anything they created stays."
        confirmLabel="Remove"
        onConfirm={() => {
          setNote("Example only: nobody was removed.");
        }}
      >
        <Subject name="Priya Raman" detail="Editor · 2 stores" />
      </ConfirmDialog>
      <DemoNote>{note}</DemoNote>
    </>
  );
}

export function FormDialogDemo() {
  return (
    <Dialog
      title={INVITE.title}
      description={INVITE.description}
      trigger={<Button leadingIcon={Plus}>Invite</Button>}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Send invitation</Button>
          </DialogClose>
        </>
      }
    >
      <InviteFields />
    </Dialog>
  );
}

export function RightDrawerDemo() {
  return (
    <Drawer
      title={MEMBER_DETAILS.title}
      description={MEMBER_DETAILS.description}
      trigger={<Button variant="secondary">Open side panel</Button>}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Close panel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save changes</Button>
          </DialogClose>
        </>
      }
    >
      <MemberDetails />
    </Drawer>
  );
}

export function LeftDrawerDemo() {
  return (
    <Drawer
      side="left"
      title="Northwind Studio"
      trigger={
        <Button variant="secondary" leadingIcon={PanelLeft}>
          Open navigation drawer
        </Button>
      }
    >
      <ExampleNav />
    </Drawer>
  );
}

export function SheetDemo() {
  return (
    <Sheet
      title="Filters"
      trigger={
        <Button variant="secondary" leadingIcon={SlidersHorizontal}>
          Open bottom sheet
        </Button>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Reset</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Show orders</Button>
          </DialogClose>
        </>
      }
    >
      <FilterFields />
    </Sheet>
  );
}

/* --- Command menu ------------------------------------------------------------------- */

export function CommandMenuDemo() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  useCommandShortcut(() => {
    setOpen((o) => !o);
  });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-10 w-full max-w-72 items-center gap-2.5 rounded-control border border-line-strong bg-surface px-3 text-body-sm text-ink-faint shadow-xs transition-colors duration-(--duration-fast) hover:border-neutral-300 hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Icon icon={Search} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <p className="text-caption text-ink-faint" aria-live="polite">
        {last ? `Would open: ${last}` : "Or press ⌘K / Ctrl+K anywhere on this page."}
      </p>
      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        items={COMMAND_ITEMS}
        onSelect={(item) => {
          setLast(item.label);
        }}
      />
    </div>
  );
}
