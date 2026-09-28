import { z } from "zod";

// Shared building blocks for each deployable app's configuration schema
// (M8, docs/operations/staging.md). Every app validates its whole
// configuration when it boots (instrumentation `register()` in the Next.js
// apps, `main.ts` in the worker), so a missing or malformed variable fails
// the deploy instead of the first request that needs it. Error messages name
// the variable and the rule, never the value.

export const STAGES = ["development", "test", "preview", "staging", "production"] as const;
export type Stage = (typeof STAGES)[number];

export const stageSchema = z.enum(STAGES).default("development");

/** Development and test: local defaults and simulators are allowed. */
export const isLocalStage = (stage: Stage) => stage === "development" || stage === "test";

/** Staging and production: real edge, real TLS, every secret set. */
export const isLiveStage = (stage: Stage) => stage === "staging" || stage === "production";

const PLACEHOLDER = /replace-me|changeme/i;

/** A random secret of at least `min` characters. */
export const secretSchema = (min = 32) =>
  z.string().min(min, `must be at least ${String(min)} characters`);

/** An optional value where "" means unset (as .env files write it). */
export const optionalSchema = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** A postgres:// connection string. */
export const databaseUrlSchema = z
  .string()
  .regex(/^postgres(ql)?:\/\/[^\s]+$/, "must be a postgres:// connection string");

/** "true" or "false" (anything else is a typo worth failing on). */
export const flagSchema = z
  .enum(["true", "false", ""])
  .optional()
  .transform((value) => value === "true");

const TLS_MODES = new Set(["require", "verify-ca", "verify-full"]);

/** The connection string asks for TLS (Neon and every hosted Postgres need it). */
export function databaseUrlUsesTls(url: string): boolean {
  try {
    const mode = new URL(url).searchParams.get("sslmode");
    return mode !== null && TLS_MODES.has(mode);
  } catch {
    return false;
  }
}

interface Issue {
  readonly path: string;
  readonly message: string;
}
type Refinement<T> = (value: T) => readonly Issue[];

/**
 * Rules that depend on the stage. Outside development and test every
 * `nonLocal` variable must be set and no `secrets` entry may still be the
 * .env.example placeholder; in staging and production every `required`
 * variable must be set and every listed database URL must require TLS.
 */
export function liveRules<T extends { STOREVIA_ENV: Stage }>(options: {
  readonly nonLocal?: readonly (keyof T & string)[];
  readonly secrets?: readonly (keyof T & string)[];
  readonly required?: readonly (keyof T & string)[];
  readonly databaseUrls?: readonly (keyof T & string)[];
}): Refinement<T> {
  return (value) => {
    const issues: Issue[] = [];
    const record = value as Record<string, unknown>;
    if (!isLocalStage(value.STOREVIA_ENV)) {
      for (const key of options.nonLocal ?? []) {
        if (!record[key])
          issues.push({ path: key, message: "required outside development and test" });
      }
      for (const key of options.secrets ?? []) {
        const secret = record[key];
        if (typeof secret === "string" && PLACEHOLDER.test(secret)) {
          issues.push({ path: key, message: "is still the example placeholder" });
        }
      }
    }
    if (isLiveStage(value.STOREVIA_ENV)) {
      for (const key of options.required ?? []) {
        if (!record[key]) issues.push({ path: key, message: "required in staging and production" });
      }
      for (const key of options.databaseUrls ?? []) {
        const url = record[key];
        if (typeof url === "string" && !databaseUrlUsesTls(url)) {
          issues.push({
            path: key,
            message: "must require TLS in staging and production (sslmode=require or verify-full)",
          });
        }
      }
    }
    return issues;
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Parses `source` with `schema` plus any stage-dependent rules, and throws a
 * ConfigurationError listing every problem (variable names and rules only).
 */
export function loadEnv<S extends z.ZodType<{ STOREVIA_ENV: Stage }>>(
  app: string,
  schema: S,
  rules: readonly Refinement<z.infer<S>>[] = [],
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigurationError(`Invalid ${app} configuration: ${problems.join("; ")}`);
  }
  const issues = rules.flatMap((rule) => rule(parsed.data));
  if (issues.length > 0) {
    const problems = issues.map((i) => `${i.path}: ${i.message}`);
    throw new ConfigurationError(`Invalid ${app} configuration: ${problems.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Runs checks that live in the packages themselves (the payment key ring,
 * media storage, the email transport, the domain provider). Each returns or
 * throws a problem; every problem is reported at once.
 */
export function runBootChecks(
  app: string,
  checks: Readonly<Record<string, () => string | null | undefined>>,
): void {
  const problems: string[] = [];
  for (const [name, check] of Object.entries(checks)) {
    let problem: string | null | undefined;
    try {
      problem = check();
    } catch (error) {
      problem = error instanceof Error ? error.message : "check failed";
    }
    if (problem) problems.push(`${name}: ${problem}`);
  }
  if (problems.length > 0) {
    throw new ConfigurationError(`Invalid ${app} configuration: ${problems.join("; ")}`);
  }
}
