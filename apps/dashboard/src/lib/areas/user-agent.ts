// Readable names for signed-in devices (account security). The session list
// stores the raw User-Agent header; people recognise "Chrome on macOS", not
// the header. Pure and best-effort: anything unrecognised stays honest
// ("Unknown browser"), and the raw string is still shown on hover.

export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";

export interface DeviceDescription {
  /** e.g. "Chrome on macOS", "Safari on iPhone", "Unknown device". */
  readonly label: string;
  readonly kind: DeviceKind;
}

// Order matters: Edge and Opera also send "Chrome", and Chrome sends "Safari".
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:HeadlessChrome|Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

function operatingSystem(ua: string): { os: string; kind: DeviceKind } | null {
  if (/\biPad\b/.test(ua)) return { os: "iPad", kind: "tablet" };
  if (/\biPhone\b|\biPod\b/.test(ua)) return { os: "iPhone", kind: "mobile" };
  if (/\bAndroid\b/.test(ua)) {
    return { os: "Android", kind: /\bMobile\b/.test(ua) ? "mobile" : "tablet" };
  }
  if (/\bCrOS\b/.test(ua)) return { os: "ChromeOS", kind: "desktop" };
  if (/\bWindows\b/.test(ua)) return { os: "Windows", kind: "desktop" };
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return { os: "macOS", kind: "desktop" };
  if (/\bLinux\b|\bX11\b/.test(ua)) return { os: "Linux", kind: "desktop" };
  return null;
}

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return { label: "Unknown device", kind: "unknown" };
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = operatingSystem(ua);
  if (browser && system) return { label: `${browser} on ${system.os}`, kind: system.kind };
  if (browser) return { label: browser, kind: "unknown" };
  if (system) return { label: `Unknown browser on ${system.os}`, kind: system.kind };
  return { label: "Unknown device", kind: "unknown" };
}
