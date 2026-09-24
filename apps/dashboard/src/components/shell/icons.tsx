import {
  BarChart3,
  Blocks,
  Building2,
  Globe,
  Home,
  Megaphone,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/lib/navigation";

export const NAV_ICONS: Record<NavIcon | "stores" | "members" | "organisation", LucideIcon> = {
  home: Home,
  orders: ShoppingBag,
  products: Package,
  customers: Users,
  website: Globe,
  analytics: BarChart3,
  marketing: Megaphone,
  apps: Blocks,
  settings: Settings,
  stores: Store,
  members: Users,
  organisation: Building2,
};
