// Structured logging and metrics (docs/architecture/02-monorepo.md §2, M8).
// JSON lines on stdout/stderr, collected by the platform's log pipeline.
//
// - Redaction: secret and personal-data keys are replaced, and every string
//   value is scanned for emails, bearer credentials, provider key ids, card
//   numbers and long opaque tokens (order links, signatures, session ids).
//   Error messages are never logged (some echo input values); only error
//   names, codes and stack frames.
// - Correlation: `withLogContext` binds fields (requestId, jobRunId…) to
//   everything logged in an async call tree, across packages.
// - Metrics are a separate stream that LOG_LEVEL never filters; a sink can
//   forward them to a metrics backend.
import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds `bindings` (e.g. requestId, organisationId) to every line. */
  child(bindings: LogFields): Logger;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY =
  /pass(word|phrase)?|secret|token|signature|authori[sz]ation|cookie|api[-_]?key|private[-_]?key|card|cvv|iban|credential/i;
/** Personal data that never needs to be in a log line. */
const PERSONAL_KEY =
  /e-?mail|recipient|phone|mobile|address|line[12]$|postal|postcode|pincode|^zip|^body$|customerName|firstName|lastName|fullName/i;
const MAX_STRING = 2000;
const MAX_DEPTH = 5;

// Values that are sensitive wherever they appear (keys can't catch them all).
const VALUE_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
  [/\b(?:rzp|sk|pk|rk|whsec)_(?:test|live)_[A-Za-z0-9]{6,}/g, "[key]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[email]"],
  // Card-like digit runs (13–19 digits, optional single spaces or dashes).
  [/\b\d(?:[ -]?\d){12,18}\b/g, "[number]"],
  // Opaque tokens: order links, HMACs, session ids, base64url secrets.
  [/[A-Za-z0-9_-]{40,}/g, "[token]"],
];

/** A string with sensitive values replaced. */
export function scrub(text: string): string {
  let out = text;
  for (const [re, replacement] of VALUE_PATTERNS) out = out.replace(re, replacement);
  return out;
}

/**
 * Returns a copy with secret and personal keys replaced, sensitive values
 * scrubbed and long strings cut.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth]";
  if (typeof value === "string")
    return scrub(value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return errorFields(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        SECRET_KEY.test(key) || PERSONAL_KEY.test(key) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]{0,126}$/;

/**
 * Database diagnostics from a Prisma driver-adapter error: the SQLSTATE and
 * the schema object named in the message (constraint, relation or column).
 * Identifiers only, never values, so they are safe to log; they turn "a
 * database error" into, e.g., 23514 on MediaAsset_storage_key_owned.
 */
function databaseFields(error: Error): Record<string, string> {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: unknown } } }).meta
    ?.driverAdapterError?.cause as
    { originalCode?: unknown; originalMessage?: unknown; kind?: unknown } | undefined;
  if (!cause) return {};
  const out: Record<string, string> = {};
  if (typeof cause.originalCode === "string" && SQLSTATE.test(cause.originalCode))
    out["dbCode"] = cause.originalCode;
  if (typeof cause.kind === "string" && IDENTIFIER.test(cause.kind)) out["dbKind"] = cause.kind;
  const message = typeof cause.originalMessage === "string" ? cause.originalMessage : "";
  for (const [field, re] of [
    ["dbConstraint", /constraint "([^"]+)"/],
    ["dbRelation", /relation "([^"]+)"/],
    ["dbColumn", /column "([^"]+)"/],
  ] as const) {
    const name = re.exec(message)?.[1];
    if (name && IDENTIFIER.test(name)) out[field] = name;
  }
  return out;
}

/** Safe description of an error: type, codes and stack frames, no message. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const code = (error as { code?: unknown }).code;
  return {
    errorName: error.name,
    ...(typeof code === "string" ? { errorCode: code } : {}),
    ...databaseFields(error),
    // Frames only: some errors (Prisma's) put a multi-line message, which
    // may echo values, before the first frame.
    stack: error.stack
      ?.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("at "))
      .slice(0, 8),
  };
}

function threshold(): number {
  const level = process.env["LOG_LEVEL"] as LogLevel | undefined;
  return LEVELS[level && level in LEVELS ? level : "info"];
}

export type LogSink = (level: LogLevel, line: string) => void;

const defaultSink: LogSink = (level, line) => {
  if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

let sink: LogSink = defaultSink;

/** Replaces the output (tests). Returns a function restoring the previous sink. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

// ---------------------------------------------------------------------------
// Correlation context.
// ---------------------------------------------------------------------------

const context = new AsyncLocalStorage<LogFields>();

/** Runs `fn` with `fields` added to every log line and metric inside it. */
export function withLogContext<T>(fields: LogFields, fn: () => T): T {
  return context.run({ ...context.getStore(), ...fields }, fn);
}

/**
 * Adds `fields` to the rest of the current async execution (the request a
 * framework is already running in its own context), for code that can't
 * wrap its caller: e.g. the storefront binds the request id when it reads
 * the request's store.
 */
export function bindLogContext(fields: LogFields): void {
  context.enterWith({ ...context.getStore(), ...fields });
}

/** The fields bound by the enclosing `withLogContext`, if any. */
export function logContext(): LogFields {
  return context.getStore() ?? {};
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * The request's correlation id: an upstream `x-request-id` when it is
 * well-formed (a load balancer or the calling service set it), else a new
 * one. Never trusted for anything but correlation.
 */
export function requestIdFrom(headers: { get(name: string): string | null }): string {
  const incoming = headers.get("x-request-id");
  return incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

export function createLogger(bindings: LogFields = {}): Logger {
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[level] < threshold()) return;
    const record = redact({ ...logContext(), ...bindings, ...fields }) as Record<string, unknown>;
    sink(level, JSON.stringify({ time: new Date().toISOString(), level, msg, ...record }));
  };
  return {
    debug: (msg, fields) => {
      write("debug", msg, fields);
    },
    info: (msg, fields) => {
      write("info", msg, fields);
    },
    warn: (msg, fields) => {
      write("warn", msg, fields);
    },
    error: (msg, fields) => {
      write("error", msg, fields);
    },
    child: (more) => createLogger({ ...bindings, ...more }),
  };
}

export const logger: Logger = createLogger();

// ---------------------------------------------------------------------------
// Metrics.
// ---------------------------------------------------------------------------

export interface MetricPoint {
  readonly metric: string;
  readonly value: number;
  readonly tags: Readonly<Record<string, string>>;
}
export type MetricSink = (point: MetricPoint, line: string) => void;

const METRIC_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const defaultMetricSink: MetricSink = (_point, line) => {
  process.stdout.write(`${line}\n`);
};
let metricSink: MetricSink = defaultMetricSink;

/** Replaces the metric output (tests, an exporter). Returns a restore function. */
export function setMetricSink(next: MetricSink): () => void {
  const previous = metricSink;
  metricSink = next;
  return () => {
    metricSink = previous;
  };
}

/**
 * Records a metric as a structured line (`type: "metric"`), whatever
 * LOG_LEVEL is. The log pipeline turns these into counters and alerts
 * (docs/operations/alerts.md); an exporter can take over through
 * `setMetricSink` without changing callers. Tag values are scrubbed like
 * log values: never put ids of people, hostnames or tokens in tags.
 */
export function recordMetric(
  name: string,
  value = 1,
  tags: Readonly<Record<string, string>> = {},
): void {
  // A malformed name is a bug, never a reason to fail the caller.
  if (!METRIC_NAME.test(name)) {
    logger.warn("invalid metric name", { metric: name.slice(0, 100) });
    return;
  }
  const safeTags: Record<string, string> = {};
  for (const [key, tag] of Object.entries(tags)) safeTags[key] = scrub(tag).slice(0, 100);
  const point = { metric: name, value, tags: safeTags };
  const ctx = logContext();
  const correlation = typeof ctx["requestId"] === "string" ? { requestId: ctx["requestId"] } : {};
  metricSink(
    point,
    JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      msg: "metric",
      type: "metric",
      ...point,
      ...correlation,
    }),
  );
}

// ---------------------------------------------------------------------------
// Unhandled request errors (Next.js `onRequestError`, M8).
// ---------------------------------------------------------------------------

export interface RequestErrorInfo {
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface RequestErrorContext {
  readonly routePath?: string;
  readonly routeType?: string;
}

/**
 * Logs a server error Next.js caught (render, route handler, server action
 * or proxy) with the request id, the route and the error's digest: never
 * its message, the query string or headers. Counted as `app.request_error`.
 */
export function reportRequestError(
  app: string,
  error: unknown,
  request: RequestErrorInfo,
  context: RequestErrorContext,
): void {
  const header = request.headers["x-request-id"];
  const requestId = typeof header === "string" && REQUEST_ID.test(header) ? header : undefined;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest).slice(0, 64)
      : undefined;
  logger.error("request failed", {
    app,
    ...(requestId ? { requestId } : {}),
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    digest,
    error,
  });
  recordMetric("app.request_error", 1, { app, routeType: context.routeType ?? "unknown" });
}
