#!/usr/bin/env node
// Storefront load driver (Milestone 8, performance/load). No dependencies:
// Node's http module with a keep-alive agent, sending each request to one
// storefront process with the store's Host header, spread round-robin over
// every store in the manifest written by `pnpm --filter @storevia/dashboard
// seed:load`. See docs/operations/load-testing.md.
//
//   pnpm load -- --port 3912 --concurrency 1,10,50 --duration 30 --warmup 5
//
// Options (flag, or environment variable):
//   --manifest     LOAD_MANIFEST     .storevia/load-manifest.json
//   --protocol     LOAD_PROTOCOL    http (local build) or https (staging)
//   --target       LOAD_TARGET      the address requests go to: 127.0.0.1 over
//                                   http; over https each store's own host
//   --port         LOAD_PORT        3002 over http, 443 over https
//   --root-domain  LOAD_ROOT_DOMAIN the manifest's root domain; platform hosts
//                                   are {slug}.{root domain}
//   --concurrency  LOAD_CONCURRENCY 10 (a comma list runs each in turn)
//   --duration     LOAD_DURATION    30 seconds measured per concurrency
//   --warmup       LOAD_WARMUP      5 seconds before each, reported apart
//   --scenarios    LOAD_SCENARIOS   home,collection,product,cart,health
//                                   (also: search, which is rate limited)
//   --out          LOAD_OUT         .storevia/load-results.json
//   --db-url       LOAD_DB_URL      optional: a Postgres URL for the database
//                                   under test; with psql on PATH, reports
//                                   transactions and rows per request from
//                                   pg_stat_database
//   --timeout      LOAD_TIMEOUT     10 seconds per request
//
// Every response that isn't 2xx (a redirect, a 404 for an unknown host,
// a 5xx) counts as an error. Exit status 1 when any measured request failed.
// Never point it at production: the production root domain is refused, and
// staging runs use synthetic stores only (docs/operations/load-testing.md).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";

const repoRoot = resolve(import.meta.dirname, "../..");

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    protocol: { type: "string" },
    target: { type: "string" },
    port: { type: "string" },
    "root-domain": { type: "string" },
    concurrency: { type: "string" },
    duration: { type: "string" },
    warmup: { type: "string" },
    scenarios: { type: "string" },
    out: { type: "string" },
    "db-url": { type: "string" },
    timeout: { type: "string" },
  },
  allowPositionals: true,
});

const setting = (flag, env, fallback) => values[flag] ?? process.env[env] ?? fallback;
const fromRoot = (path) => (isAbsolute(path) ? path : resolve(repoRoot, path));
function number(flag, env, fallback, min, max) {
  const raw = setting(flag, env, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`--${flag} must be a number from ${String(min)} to ${String(max)}`);
  }
  return value;
}

const manifestPath = fromRoot(setting("manifest", "LOAD_MANIFEST", ".storevia/load-manifest.json"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const protocol = setting("protocol", "LOAD_PROTOCOL", "http");
if (protocol !== "http" && protocol !== "https") throw new Error("--protocol is http or https");
const secure = protocol === "https";
const client = secure ? https : http;
// Over https the connection goes to each store's own host (DNS, SNI).
const target = setting("target", "LOAD_TARGET", secure ? null : "127.0.0.1");
const port = number("port", "LOAD_PORT", secure ? 443 : 3002, 1, 65_535);
const defaultPort = port === (secure ? 443 : 80);
const rootDomain = setting("root-domain", "LOAD_ROOT_DOMAIN", manifest.rootDomain);
if (rootDomain === "storevia.site") {
  throw new Error("refusing to load-test production (root domain storevia.site)");
}
const cartCookie = secure ? "__Host-sv_cart" : "sv_cart";
const concurrencies = setting("concurrency", "LOAD_CONCURRENCY", "10")
  .split(",")
  .map((c) => Number(c.trim()));
if (concurrencies.some((c) => !Number.isInteger(c) || c < 1 || c > 1_000)) {
  throw new Error("--concurrency must be whole numbers from 1 to 1000");
}
const durationMs = number("duration", "LOAD_DURATION", 30, 1, 3_600) * 1000;
const warmupMs = number("warmup", "LOAD_WARMUP", 5, 0, 600) * 1000;
const timeoutMs = number("timeout", "LOAD_TIMEOUT", 10, 1, 120) * 1000;
const outPath = fromRoot(setting("out", "LOAD_OUT", ".storevia/load-results.json"));
const dbUrl = setting("db-url", "LOAD_DB_URL", "");
const KNOWN = ["home", "collection", "product", "cart", "health", "search"];
const scenarioNames = setting("scenarios", "LOAD_SCENARIOS", "home,collection,product,cart,health")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const name of scenarioNames) {
  if (!KNOWN.includes(name)) throw new Error(`unknown scenario "${name}" (${KNOWN.join(", ")})`);
}

// Stores in the manifest: the host to request (a custom primary domain when
// the store has one, otherwise {slug}.{root domain}) and what to request.
const stores = manifest.stores.map((s) => ({
  slug: s.slug,
  host: s.customDomain && s.host === s.customDomain ? s.host : `${s.slug}.${rootDomain}`,
  products: s.productHandles,
  collections: s.collectionHandles,
  carts: s.cartTokens,
}));
if (stores.length === 0) throw new Error(`no stores in ${manifestPath}`);

const SEARCH_TERMS = ["mug", "linen", "towel", "oak", "glass", "wool"];
const pick = (list, n) => list[n % list.length];

/** The nth request of a scenario: the store rotates first, so every store is hit. */
const SCENARIOS = {
  home: (n) => ({ store: pick(stores, n), path: "/" }),
  collection: (n) => {
    const store = pick(stores, n);
    const round = Math.floor(n / stores.length);
    return { store, path: `/collections/${pick(store.collections, round)}` };
  },
  product: (n) => {
    const store = pick(stores, n);
    const round = Math.floor(n / stores.length);
    return { store, path: `/products/${pick(store.products, round)}` };
  },
  cart: (n) => {
    const store = pick(stores, n);
    const round = Math.floor(n / stores.length);
    const token = store.carts.length > 0 ? pick(store.carts, round) : null;
    return { store, path: "/cart", cookie: token ? `${cartCookie}=${token}` : undefined };
  },
  health: (n) => ({ store: pick(stores, n), path: "/api/health" }),
  search: (n) => {
    const store = pick(stores, n);
    const round = Math.floor(n / stores.length);
    return { store, path: `/search?q=${pick(SEARCH_TERMS, round)}` };
  },
};

function request(agent, { store, path, cookie }) {
  return new Promise((done) => {
    const started = process.hrtime.bigint();
    const finish = (status, error) =>
      done({ status, error, ms: Number(process.hrtime.bigint() - started) / 1e6 });
    const req = client.request(
      {
        host: target ?? store.host,
        port,
        path,
        method: "GET",
        agent,
        ...(secure ? { servername: store.host } : {}),
        headers: {
          Host: defaultPort ? store.host : `${store.host}:${String(port)}`,
          Accept: "text/html,application/json",
          "User-Agent": "storevia-load/1",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => finish(res.statusCode ?? 0, null));
        res.on("error", (e) => finish(0, e.code ?? e.message));
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (e) => finish(0, e.code ?? e.message));
    req.end();
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const round = (n) => Math.round(n * 10) / 10;

function summarise(samples, seconds) {
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statuses = {};
  let errors = 0;
  for (const s of samples) {
    const key = s.error ? `error:${s.error}` : String(s.status);
    statuses[key] = (statuses[key] ?? 0) + 1;
    if (s.error || s.status < 200 || s.status > 299) errors += 1;
  }
  return {
    requests: samples.length,
    rps: round(samples.length / seconds),
    p50: round(percentile(latencies, 50)),
    p95: round(percentile(latencies, 95)),
    p99: round(percentile(latencies, 99)),
    max: round(latencies.at(-1) ?? 0),
    mean: round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    errors,
    statuses,
  };
}

/** Runs `concurrency` workers for `ms`; returns samples by scenario. */
async function phase(concurrency, ms, counters) {
  const agent = new client.Agent({ keepAlive: true, maxSockets: concurrency });
  const samples = Object.fromEntries(scenarioNames.map((s) => [s, []]));
  const failures = [];
  const deadline = Date.now() + ms;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < deadline) {
        const name = scenarioNames[next % scenarioNames.length];
        next += 1;
        const n = counters[name]++;
        const spec = SCENARIOS[name](n);
        const result = await request(agent, spec);
        samples[name].push(result);
        const ok = !result.error && result.status >= 200 && result.status <= 299;
        if (!ok && failures.length < 20) {
          failures.push({ scenario: name, host: spec.store.host, path: spec.path, ...result });
        }
      }
    }),
  );
  agent.destroy();
  return { samples, failures };
}

function pgStats() {
  if (!dbUrl) return null;
  try {
    const out = execFileSync(
      "psql",
      [
        dbUrl,
        "-Atc",
        `SELECT xact_commit + xact_rollback, tup_returned, tup_fetched,
                tup_inserted + tup_updated + tup_deleted, blks_read, blks_hit
         FROM pg_stat_database WHERE datname = current_database()`,
      ],
      { encoding: "utf8" },
    );
    const [xacts, returned, fetched, written, read, hit] = out.trim().split("|").map(Number);
    return { xacts, returned, fetched, written, read, hit };
  } catch (error) {
    console.warn(`pg_stat_database unavailable: ${error.message.split("\n")[0]}`);
    return null;
  }
}

// Backends flush their statistics about once a second while busy and
// within ~10 s when idle (PostgreSQL 15+); wait before the second read.
const statsSettle = () => new Promise((r) => setTimeout(r, 11_000));

function table(title, rows) {
  const head = ["scenario", "requests", "req/s", "p50", "p95", "p99", "max", "errors"];
  const lines = rows.map(([name, s]) => [
    name,
    String(s.requests),
    String(s.rps),
    String(s.p50),
    String(s.p95),
    String(s.p99),
    String(s.max),
    String(s.errors),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  console.log(`\n${title} (latency in ms)`);
  console.log(fmt(head));
  for (const l of lines) console.log(fmt(l));
}

async function preflight() {
  const agent = new client.Agent({ keepAlive: true, maxSockets: 8 });
  const problems = [];
  await Promise.all(
    stores.map(async (store) => {
      const r = await request(agent, { store, path: "/" });
      if (r.error || r.status !== 200) problems.push(`${store.host}: ${r.error ?? r.status}`);
    }),
  );
  agent.destroy();
  return problems;
}

const machine = {
  cpus: os.cpus().length,
  cpuModel: os.cpus()[0]?.model ?? "unknown",
  memoryGiB: round(os.totalmem() / 2 ** 30),
  platform: `${os.platform()} ${os.release()}`,
  node: process.version,
};

console.log(
  `Load: ${String(stores.length)} stores from ${manifestPath}, target ${target ?? "each store host"}:${String(port)}, ` +
    `scenarios ${scenarioNames.join(", ")}`,
);
console.log(`Machine: ${JSON.stringify(machine)}`);
const problems = await preflight();
if (problems.length > 0) {
  console.error(`Preflight: ${String(problems.length)} stores didn't answer 200 on /:`);
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
}

const runs = [];
let failed = problems.length > 0;
const counters = Object.fromEntries(scenarioNames.map((s) => [s, 0]));
for (const concurrency of concurrencies) {
  let warmup = null;
  if (warmupMs > 0) {
    const w = await phase(concurrency, warmupMs, counters);
    warmup = summarise(Object.values(w.samples).flat(), warmupMs / 1000);
  }
  const before = pgStats();
  const started = Date.now();
  const { samples, failures } = await phase(concurrency, durationMs, counters);
  const seconds = (Date.now() - started) / 1000;
  const scenarios = Object.fromEntries(
    scenarioNames.map((name) => [name, summarise(samples[name], seconds)]),
  );
  const total = summarise(Object.values(samples).flat(), seconds);
  let database = null;
  if (before) {
    await statsSettle();
    const after = pgStats();
    if (after) {
      const per = (k) => round((after[k] - before[k]) / Math.max(1, total.requests));
      database = {
        note: "deltas over the measured phase (plus the settle wait), per request",
        transactionsPerRequest: per("xacts"),
        rowsReturnedPerRequest: per("returned"),
        rowsFetchedPerRequest: per("fetched"),
        rowsWrittenPerRequest: per("written"),
        blocksReadPerRequest: per("read"),
        blocksHitPerRequest: per("hit"),
      };
    }
  }
  runs.push({ concurrency, seconds: round(seconds), warmup, scenarios, total, database, failures });
  table(`Concurrency ${String(concurrency)}, ${String(round(seconds))} s`, [
    ...Object.entries(scenarios),
    ["TOTAL", total],
  ]);
  if (warmup) {
    console.log(
      `warm-up: ${String(warmup.requests)} requests, p50 ${String(warmup.p50)} p95 ${String(warmup.p95)} max ${String(warmup.max)} ms, errors ${String(warmup.errors)}`,
    );
  }
  if (database) console.log(`database per request: ${JSON.stringify(database)}`);
  if (total.errors > 0) {
    failed = true;
    console.error(`${String(total.errors)} requests failed; first ones:`);
    for (const f of failures.slice(0, 5)) {
      console.error(`  ${f.scenario} ${f.host}${f.path} → ${f.error ?? String(f.status)}`);
    }
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      finishedAt: new Date().toISOString(),
      machine,
      target: `${protocol}://${target ?? "store hosts"}:${String(port)}`,
      manifest: { path: manifestPath, volume: manifest.volume, stores: stores.length },
      options: {
        concurrencies,
        durationSeconds: durationMs / 1000,
        warmupSeconds: warmupMs / 1000,
        scenarios: scenarioNames,
      },
      preflightProblems: problems,
      runs,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nResults: ${outPath}`);
process.exitCode = failed ? 1 : 0;
