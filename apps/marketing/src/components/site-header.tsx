"use client";

// The sticky white header. Desktop (1024 px and up) gets the full navigation
// with mega-menus; tablets and phones get the logo, Start free and a menu
// button that opens the drawer (mobile-menu.tsx). A hairline appears once the
// page scrolls under it.
//
// Each menu is the WAI-ARIA "disclosure navigation with top-level links"
// pattern: the label is a real link to the section's landing page, and the
// chevron beside it is the button that opens the panel. Hovering either one
// opens the panel too; that hover logic lives here (not in Radix) so moving
// between the label, the chevron and the panel never closes it.
import {
  buttonClasses,
  cn,
  Icon,
  Logo,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@storevia/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CONTAINER_CLASS } from "./marketing/section";
import { StatusPill } from "./marketing/status-pill";
import { MobileMenu } from "./mobile-menu";
import { isCurrentSection, PRIMARY_NAV, type MenuLink, type NavMenu } from "./nav";

/** True once the page has scrolled, for the header's hairline. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 4);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);
  return scrolled;
}

// Radix's own timings: open after a short intent delay, switch instantly
// between menus once one is open, close shortly after the pointer leaves.
const OPEN_DELAY = 150;
const CLOSE_DELAY = 150;

/** Hover intent for the whole menu: which panel is open, and handlers to drive it. */
function useHoverMenu() {
  const [value, setValue] = useState("");
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  // The open panel, readable from the timers' callbacks.
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);

  const clear = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clear, [clear]);

  const enter = useCallback(
    (item: string) => (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") return;
      clear();
      if (current.current) setValue(item);
      else {
        openTimer.current = window.setTimeout(() => {
          setValue(item);
        }, OPEN_DELAY);
      }
    },
    [clear],
  );
  const leave = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") return;
      clear();
      closeTimer.current = window.setTimeout(() => {
        setValue("");
      }, CLOSE_DELAY);
    },
    [clear],
  );
  // Keeps Radix's built-in hover handling out of the way (ours covers the label too).
  const block = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
  }, []);
  return {
    value,
    setValue,
    item: (id: string) => ({ onPointerEnter: enter(id), onPointerLeave: leave }),
    trigger: { onPointerMove: block, onPointerLeave: block },
    panel: {
      onPointerEnter: (event: ReactPointerEvent) => {
        if (event.pointerType === "mouse") clear();
      },
      onPointerLeave: (event: ReactPointerEvent) => {
        block(event);
        leave(event);
      },
    },
  };
}

// The current section: darker text and a short rule under the label (so the
// mark isn't colour alone). ::before, because ::after is the touch hit area.
const CURRENT =
  "text-ink before:absolute before:inset-x-3 before:-bottom-[13px] before:h-0.5 before:rounded-pill before:bg-ink";

function PanelLink({ link }: { link: MenuLink }) {
  return (
    <NavigationMenuLink
      asChild
      title={
        <>
          {link.title}
          {link.status ? <StatusPill status={link.status} className="ml-2 align-[1px]" /> : null}
        </>
      }
      description={link.description}
      {...(link.glyph ? { glyph: link.glyph } : {})}
      {...(link.icon ? { icon: link.icon } : {})}
    >
      <Link href={link.href} />
    </NavigationMenuLink>
  );
}

// Panel widths by the number of link columns.
const PANEL_WIDTH = { 1: "w-[22rem]", 2: "w-[42rem]", 3: "w-[52rem]" } as const;

function MenuPanel({ menu }: { menu: NavMenu }) {
  const columns = Math.min(
    3,
    menu.groups.reduce((sum, group) => sum + (group.columns ?? 1), 0),
  ) as 1 | 2 | 3;
  return (
    <div className={PANEL_WIDTH[columns]}>
      <div
        className={cn(
          "grid gap-x-2 gap-y-3",
          columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {menu.groups.map((group) => (
          <div key={group.heading} className={cn(group.columns === 2 && "col-span-2")}>
            <p className="px-3 pt-2.5 pb-1.5 text-overline text-ink-faint uppercase">
              {group.heading}
            </p>
            <ul className={cn("grid", group.columns === 2 && "grid-cols-2")}>
              {group.links.map((link) => (
                <li key={link.href}>
                  <PanelLink link={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {menu.footer ? (
        <div className="mt-2 flex items-center justify-between gap-6 rounded-control bg-subtle py-1 pr-1 pl-3">
          <p className="text-body-sm text-ink-muted">{menu.footer.text}</p>
          <ul className="flex shrink-0 items-center">
            {menu.footer.links.map((link) => (
              <li key={link.href}>
                <NavigationMenuLink
                  asChild
                  className="text-brand-700 hover:bg-surface hover:text-brand-800"
                >
                  <Link href={link.href}>
                    {link.label}
                    <Icon icon={ArrowRight} size="sm" />
                  </Link>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// One pill for the label and its chevron: they highlight together on hover
// and while the panel is open.
const ITEM =
  "relative flex items-center rounded-control transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-subtle has-data-[state=open]:bg-subtle";

function DesktopNav({ pathname }: { pathname: string }) {
  const menu = useHoverMenu();
  // Leaving the page (a link in a panel, the logo) closes whatever is open.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    menu.setValue("");
  }
  return (
    <NavigationMenu
      aria-label="Main"
      value={menu.value}
      onValueChange={menu.setValue}
      viewport={false}
      // Full header height, so panels open just under the header's edge.
      className="hidden self-stretch lg:flex"
    >
      <NavigationMenuList className="h-full gap-1">
        {PRIMARY_NAV.map((item) => {
          const current = isCurrentSection(item, pathname);
          const label = (
            <NavigationMenuLink
              asChild
              active={pathname === item.href}
              className={cn(
                "hover:bg-transparent",
                item.kind === "menu" && "pr-1.5",
                current && CURRENT,
              )}
            >
              <Link href={item.href}>{item.label}</Link>
            </NavigationMenuLink>
          );
          if (item.kind === "link") {
            return (
              <NavigationMenuItem key={item.href} className="flex h-full items-center">
                <div className={ITEM}>{label}</div>
              </NavigationMenuItem>
            );
          }
          return (
            <NavigationMenuItem
              key={item.href}
              value={item.label}
              className="flex h-full items-center"
              {...menu.item(item.label)}
            >
              <div className={ITEM}>
                {label}
                <NavigationMenuTrigger
                  aria-label={`${item.label} menu`}
                  className="w-7 justify-center px-0 hover:bg-transparent pointer-coarse:w-11"
                  {...menu.trigger}
                />
              </div>
              <NavigationMenuContent>
                <MenuPanel menu={item} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
      <NavigationMenuViewport align="start" {...menu.panel} />
    </NavigationMenu>
  );
}

export function SiteHeader({ signInHref, signUpHref }: { signInHref: string; signUpHref: string }) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        "sticky top-0 z-(--z-sticky) border-b bg-surface transition-[border-color] duration-(--duration-base) ease-(--ease-standard)",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <div className={cn(CONTAINER_CLASS, "flex h-16 items-center gap-8")}>
        <Link href="/" aria-label="Storevia home" className="shrink-0 rounded-control">
          <Logo />
        </Link>
        <DesktopNav pathname={pathname} />
        <div className="ml-auto flex items-center gap-2">
          {/* Tablets and phones find "Log in" at the bottom of the menu drawer. */}
          <a href={signInHref} className={buttonClasses("ghost", "sm", "hidden lg:inline-flex")}>
            Log in
          </a>
          <a href={signUpHref} className={buttonClasses("primary", "sm")}>
            Start free
          </a>
          <MobileMenu pathname={pathname} signInHref={signInHref} signUpHref={signUpHref} />
        </div>
      </div>
    </header>
  );
}
