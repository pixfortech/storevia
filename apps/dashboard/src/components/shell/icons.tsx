import {
  BarChart3,
  Blocks,
  Boxes,
  CreditCard,
  FileText,
  FolderTree,
  Globe,
  House,
  Images,
  LayoutGrid,
  Megaphone,
  Package,
  PenLine,
  Rss,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserPen,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AreaKey } from "@storevia/tenancy/business-types";

// One icon per destination, all Lucide at the shared stroke (ICON_STROKE).
// Customers are one person and members a group, so an online store's
// Customers and its organisation's Members never share an icon.
export const NAV_ICONS: Record<
  AreaKey | "apps" | "stores" | "members" | "billing" | "security",
  LucideIcon
> = {
  home: House,
  orders: ShoppingBag,
  products: Package,
  inventory: Boxes,
  customers: UserRound,
  website: Globe,
  pages: FileText,
  posts: PenLine,
  categories: FolderTree,
  authors: UserPen,
  projects: LayoutGrid,
  blog: Rss,
  media: Images,
  marketing: Megaphone,
  analytics: BarChart3,
  settings: Settings,
  apps: Blocks,
  stores: Store,
  members: Users,
  billing: CreditCard,
  security: ShieldCheck,
};
