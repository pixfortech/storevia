"use client";

import { toTypeId } from "@storevia/types";
import { Button, IconButton } from "@storevia/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@storevia/ui/popover";
import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadNotificationsAction,
  markNotificationsReadAction,
  type BellState,
} from "@/app/(app)/notifications/actions";

// The notification centre (post-M7): a bell with the unread count, a list,
// and mark read. It refreshes on navigation and every minute while the tab
// is visible (no sockets: a customer message isn't a chat).

const REFRESH_MS = 60_000;

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function NotificationBell({
  organisationId,
  variant = "bar",
}: {
  organisationId: string;
  /** The phone top bar renders its own bell (the desktop one is hidden there). */
  variant?: "bar" | "mobile";
}) {
  const orgId = toTypeId("organisation", organisationId);
  const pathname = usePathname();
  const [state, setState] = useState<BellState>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    void loadNotificationsAction(orgId).then(setState, () => undefined);
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const label =
    state.unread > 0
      ? `Notifications, ${String(state.unread)} unread`
      : "Notifications, none unread";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
    >
      <span className="relative inline-flex">
        <PopoverTrigger asChild>
          <IconButton
            icon={Bell}
            aria-label={label}
            data-testid={variant === "mobile" ? "notification-bell-mobile" : "notification-bell"}
          />
        </PopoverTrigger>
        {state.unread > 0 ? (
          <span
            aria-hidden
            data-testid={variant === "mobile" ? "notification-count-mobile" : "notification-count"}
            className="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[0.6875rem] leading-4 font-semibold text-white tabular-nums"
          >
            {state.unread > 99 ? "99+" : state.unread}
          </span>
        ) : null}
      </span>
      <PopoverContent align="end" className="w-80 p-0" aria-label="Notifications">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-label font-semibold text-ink">Notifications</h2>
          {state.unread > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              pending={pending}
              onClick={() => {
                startTransition(async () => {
                  setState(await markNotificationsReadAction(orgId, "all"));
                });
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {state.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-ink-muted">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto" data-testid="notifications">
            {state.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  data-unread={n.read ? undefined : ""}
                  className="block px-4 py-3 hover:bg-subtle focus-visible:bg-subtle"
                  onClick={() => {
                    setOpen(false);
                    if (!n.read) {
                      void markNotificationsReadAction(orgId, [n.id]).then(
                        setState,
                        () => undefined,
                      );
                    }
                  }}
                >
                  <span className="flex items-start gap-2">
                    {n.read ? (
                      <span className="mt-1.5 size-2 shrink-0" aria-hidden />
                    ) : (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <span
                        className={
                          n.read
                            ? "block text-body-sm text-ink-muted"
                            : "block text-body-sm font-medium text-ink"
                        }
                      >
                        {n.read ? null : <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="block text-caption text-ink-faint">
                        {n.storeName} · {ago(n.createdAt)}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
