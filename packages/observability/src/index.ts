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

/** Safe description of an error: type, code and a few stack frames, no message. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const code = (error as { code?: unknown }).code;
  return {
    errorName: error.name,
    ...(typeof code === "string" ? { errorCode: code } : {}),
    stack: error.stack
      ?.split("\n")
      .slice(1, 8)
      .map((line) => line.trim()),
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
