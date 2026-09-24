// Toolchain status and update planning (docs/engineering/toolchain-policy.md).
//
//   pnpm toolchain:check            human-readable status for this machine
//   node scripts/toolchain-check.mjs --github
//                                   CI mode (.github/workflows/toolchain-watch.yml):
//                                   writes outputs and a job summary
//
// It reads the policy from the repository (package.json engines and
// packageManager, .nvmrc, the gitleaks pin in ci.yml) and compares it with
// what upstream has released. It never changes anything by itself.
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- pure helpers (unit tested) ---------------------------------------------

/** Parses "1.2.3" (optionally "v1.2.3"); null for pre-releases and junk. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) throw new Error(`not a stable version: ${a} / ${b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Highest stable version, optionally within one major. */
export function latestStable(versions, major) {
  return versions
    .filter((v) => parseVersion(v) && (major === undefined || parseVersion(v)[0] === major))
    .sort(compareVersions)
    .at(-1);
}

/** Summarises https://nodejs.org/dist/index.json. */
export function nodeReleases(index) {
  const lts = index.filter((r) => r.lts && parseVersion(r.version));
  const all = index.filter((r) => parseVersion(r.version));
  const latestLts = latestStable(lts.map((r) => r.version));
  const latestCurrent = latestStable(all.map((r) => r.version));
  const latestInMajor = (major) =>
    latestStable(
      all.map((r) => r.version),
      major,
    );
  return {
    latestLts,
    latestLtsMajor: latestLts ? parseVersion(latestLts)[0] : undefined,
    latestCurrent,
    latestCurrentMajor: latestCurrent ? parseVersion(latestCurrent)[0] : undefined,
    latestInMajor,
  };
}

/** Minimum Node major from an engines range such as ">=24" or ">=24.3.0". */
export function engineFloorMajor(range) {
  const match = /^>=\s*v?(\d+)(?:\.\d+){0,2}$/.exec(String(range).trim());
  if (!match) throw new Error(`engines.node must be a plain floor like ">=24", got "${range}"`);
  return Number(match[1]);
}

/**
 * What should happen next. Pull requests are proposed only for changes that
 * CI can prove on their own (same-major pnpm, Node LTS promotion); anything
 * else is reported for review.
 */
export function plan({ packageManager, pnpmVersions, primaryMajor, node, gitleaks }) {
  const actions = [];
  const [name, current] = String(packageManager).split("@");
  if (name !== "pnpm" || !parseVersion(current)) {
    throw new Error(`packageManager must pin an exact pnpm version, got "${packageManager}"`);
  }
  const currentMajor = parseVersion(current)[0];
  const sameMajor = latestStable(pnpmVersions, currentMajor);
  if (sameMajor && compareVersions(sameMajor, current) > 0) {
    actions.push({ kind: "pnpm-update", from: current, to: sameMajor, proposal: "pull-request" });
  }
  const newest = latestStable(pnpmVersions);
  if (newest && parseVersion(newest)[0] > currentMajor) {
    actions.push({ kind: "pnpm-major", from: current, to: newest, proposal: "review" });
  }
  if (node.latestLtsMajor !== undefined && node.latestLtsMajor > primaryMajor) {
    actions.push({
      kind: "node-lts-promotion",
      from: primaryMajor,
      to: node.latestLtsMajor,
      proposal: "pull-request",
    });
  }
  if (
    gitleaks?.latest &&
    gitleaks.current &&
    compareVersions(gitleaks.latest, gitleaks.current) > 0
  ) {
    actions.push({
      kind: "gitleaks-update",
      from: gitleaks.current,
      to: gitleaks.latest,
      proposal: "review",
    });
  }
  return actions;
}

/** Where a given local runtime stands against the policy. */
export function assessRuntime(version, { floorMajor, primaryMajor, node }) {
  const parsed = parseVersion(version);
  if (!parsed) return { level: "unknown", message: `unrecognised Node version ${version}` };
  const major = parsed[0];
  if (major < floorMajor) {
    return {
      level: "unsupported",
      message: `below the minimum (Node ${floorMajor}): upgrade Node`,
    };
  }
  if (major === primaryMajor) {
    return {
      level: "supported",
      message: `the required CI runtime line (Node ${primaryMajor} LTS)`,
    };
  }
  if (major === node.latestCurrentMajor) {
    return {
      level: "canary",
      message: `the canary line: tested in CI and expected to work, not yet the required runtime`,
    };
  }
  if (major > primaryMajor) {
    return { level: "untested", message: `newer than anything CI tests: may work, not verified` };
  }
  return {
    level: "allowed",
    message: `above the minimum, but not the tested line (Node ${primaryMajor})`,
  };
}

// --- CLI -----------------------------------------------------------------------

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function gather() {
  const pkg = JSON.parse(read("package.json"));
  const primaryMajor = Number(read(".nvmrc").trim());
  const gitleaksCurrent = /GITLEAKS_VERSION:\s*([\d.]+)/.exec(
    read(".github/workflows/ci.yml"),
  )?.[1];
  const [registry, index] = await Promise.all([
    fetchJson("https://registry.npmjs.org/pnpm"),
    fetchJson("https://nodejs.org/dist/index.json"),
  ]);
  let gitleaksLatest;
  try {
    const token = process.env.GITHUB_TOKEN;
    const release = await fetchJson(
      "https://api.github.com/repos/gitleaks/gitleaks/releases/latest",
      token ? { authorization: `Bearer ${token}` } : {},
    );
    gitleaksLatest = String(release.tag_name).replace(/^v/, "");
  } catch {
    gitleaksLatest = undefined; // Rate-limited or offline: skip, never guess.
  }
  const node = nodeReleases(index);
  return {
    pkg,
    primaryMajor,
    floorMajor: engineFloorMajor(pkg.engines.node),
    node,
    actions: plan({
      packageManager: pkg.packageManager,
      pnpmVersions: Object.keys(registry.versions),
      primaryMajor,
      node,
      gitleaks: { current: gitleaksCurrent, latest: gitleaksLatest },
    }),
  };
}

function describe(action) {
  switch (action.kind) {
    case "pnpm-update":
      return `pnpm ${action.from} → ${action.to} (same major: a pull request can prove it)`;
    case "pnpm-major":
      return `pnpm ${action.to} is a new major (current ${action.from}): review release notes first`;
    case "node-lts-promotion":
      return `Node ${action.to} is now the latest LTS (CI requires ${action.from}): propose promotion`;
    case "gitleaks-update":
      return `gitleaks ${action.to} is available (CI pins ${action.from}): update version and checksum`;
    default:
      return JSON.stringify(action);
  }
}

async function main() {
  const github = process.argv.includes("--github");
  const status = await gather();
  const { node, primaryMajor, floorMajor, pkg, actions } = status;
  const primaryLatest = node.latestInMajor(primaryMajor);
  const lines = [
    `Minimum supported Node: ${floorMajor} (engines.node "${pkg.engines.node}")`,
    `Required CI runtime: Node ${primaryMajor} LTS line (.nvmrc), latest ${primaryLatest ?? "?"}`,
    `Canary CI runtime: Node Current, latest ${node.latestCurrent ?? "?"}`,
    `Latest Node LTS upstream: ${node.latestLts ?? "?"}`,
    `pnpm: ${pkg.packageManager} (packageManager, reproducible installs)`,
  ];
  if (!github) {
    const local = assessRuntime(process.version, { floorMajor, primaryMajor, node });
    lines.push(`This machine: Node ${process.version.slice(1)}: ${local.message}`);
  }
  lines.push(
    actions.length === 0 ? "Toolchain is current." : "Updates:",
    ...actions.map((a) => `- ${describe(a)}`),
  );
  console.log(lines.join("\n"));
  if (github) {
    const pnpmUpdate = actions.find((a) => a.kind === "pnpm-update")?.to ?? "";
    const promotion = actions.find((a) => a.kind === "node-lts-promotion")?.to ?? "";
    const review = actions.filter((a) => a.proposal === "review").map(describe);
    const out = process.env.GITHUB_OUTPUT;
    if (out) {
      appendFileSync(out, `pnpm_update=${pnpmUpdate}\nnode_promotion=${promotion}\n`);
      if (review.length > 0) {
        appendFileSync(out, `review<<EOF_REVIEW\n${review.join("\n")}\nEOF_REVIEW\n`);
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n\n")}\n`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`toolchain check failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
