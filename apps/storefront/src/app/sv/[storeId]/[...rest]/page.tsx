import { notFound } from "next/navigation";

// Anything that isn't a storefront route renders the store's 404 page.
export default function CatchAll(): never {
  notFound();
}
