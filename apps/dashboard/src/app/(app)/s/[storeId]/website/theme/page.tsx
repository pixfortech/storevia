import { redirect } from "next/navigation";

// Themes moved to their own area (08-themes.md §10.7). Old links keep
// working: the customiser link (`?theme=`) opens the customiser, anything
// else the theme library. The new pages check access themselves.

export default async function OldThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const { theme } = await searchParams;
  const base = `/s/${encodeURIComponent(storeId)}/themes`;
  redirect(
    typeof theme === "string" && theme !== ""
      ? `${base}/customise?theme=${encodeURIComponent(theme)}`
      : base,
  );
}
