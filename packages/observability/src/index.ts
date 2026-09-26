// Structured logging and metrics (docs/architecture/02-monorepo.md §2).
// JSON lines on stdout/stderr, collected by the platform's log pipeline.
// Secrets are redacted by key name, and error messages are never logged
// (some echo input values); only error names, codes and stack frames.

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
  /pass(word|phrase)?|secret|token|signature|authori[sz]ation|cookie|api[-_]?key|private[-_]?key|card|cvv|iban/i;
const MAX_STRING = 2000;
const MAX_DEPTH = 5;

/** Returns a copy with secret-looking keys replaced and long strings cut. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth]";
  if (typeof value === "string")
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return errorFields(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redact(v, depth + 1);
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

export function createLogger(bindings: LogFields = {}): Logger {
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[level] < threshold()) return;
    const record = redact({ ...bindings, ...fields }) as Record<string, unknown>;
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

/**
 * Records a metric as a structured log line (`type: "metric"`). The log
 * pipeline turns these into counters; an OpenTelemetry exporter can replace
 * this function without changing callers.
 */
export function recordMetric(
  name: string,
  value = 1,
  tags: Readonly<Record<string, string>> = {},
): void {
  logger.info("metric", { type: "metric", metric: name, value, tags });
}
