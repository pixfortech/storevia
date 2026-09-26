// Minimal self-contained HTML for responses that are not store pages: the
// generic "no store here" 404 (no store data at all) and the coming-soon /
// unavailable status pages. Text is escaped; there is no script.

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

const STYLE =
  "body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#fafaf9;color:#1c1917;padding:1.5rem;box-sizing:border-box}" +
  "main{max-width:32rem;text-align:center}h1{font-size:1.75rem;margin:0 0 .75rem;font-weight:600}p{margin:0;color:#57534e;line-height:1.6}";

export function simplePage(options: {
  readonly title: string;
  readonly heading: string;
  readonly message: string;
  readonly lang?: string;
  readonly nonce?: string;
}): string {
  const nonce = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
  return (
    `<!doctype html><html lang="${escapeHtml(options.lang ?? "en")}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${escapeHtml(options.title)}</title><style${nonce}>${STYLE}</style></head>` +
    `<body><main><h1>${escapeHtml(options.heading)}</h1><p>${escapeHtml(options.message)}</p></main></body></html>`
  );
}

/** For hosts that aren't an active store domain: nothing about any store. */
export function unknownHostPage(nonce?: string): string {
  return simplePage({
    title: "Store not found",
    heading: "There's no store here",
    message:
      "Check the address you entered. If you run this store, its domain may still be setting up.",
    ...(nonce ? { nonce } : {}),
  });
}
