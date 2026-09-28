import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ConfigurationError,
  databaseUrlSchema,
  databaseUrlUsesTls,
  flagSchema,
  liveRules,
  loadEnv,
  optionalSchema,
  runBootChecks,
  secretSchema,
  stageSchema,
} from "./env";

const schema = z.object({
  STOREVIA_ENV: stageSchema,
  DATABASE_URL: databaseUrlSchema,
  AUTH_SECRET: secretSchema(),
  TRUSTED_CLIENT_IP_HEADER: optionalSchema,
  ORDER_ACCESS_SECRET: secretSchema().optional(),
  FEATURE: flagSchema,
});
const rules = [
  liveRules<z.infer<typeof schema>>({
    secrets: ["AUTH_SECRET"],
    required: ["TRUSTED_CLIENT_IP_HEADER"],
    nonLocal: ["ORDER_ACCESS_SECRET"],
    databaseUrls: ["DATABASE_URL"],
  }),
];

const SECRET = "s3cr3t-value-that-is-long-enough-000000";
const local = {
  DATABASE_URL: "postgresql://app:pw@localhost:5432/storevia",
  AUTH_SECRET: SECRET,
};

describe("loadEnv", () => {
  it("accepts a local configuration with defaults", () => {
    const env = loadEnv("test-app", schema, rules, local);
    expect(env.STOREVIA_ENV).toBe("development");
    expect(env.TRUSTED_CLIENT_IP_HEADER).toBeUndefined();
    expect(env.FEATURE).toBe(false);
  });

  it("lists every problem by name and never echoes a value", () => {
    const attempt = () =>
      loadEnv("test-app", schema, rules, {
        DATABASE_URL: "mysql://root:hunter2@db/storevia",
        AUTH_SECRET: "too-short-hunter3",
        FEATURE: "yes",
      });
    expect(attempt).toThrow(ConfigurationError);
    const message = (() => {
      try {
        attempt();
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toMatch(/^Invalid test-app configuration: /);
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("AUTH_SECRET: must be at least 32 characters");
    expect(message).toContain("FEATURE");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("hunter3");
  });

  it("the .env.example placeholder works locally and nowhere else", () => {
    const placeholder = { ...local, AUTH_SECRET: "replace-me-with-32-random-characters" };
    expect(loadEnv("test-app", schema, rules, placeholder).AUTH_SECRET).toHaveLength(36);
    expect(() =>
      loadEnv("test-app", schema, rules, {
        ...placeholder,
        STOREVIA_ENV: "preview",
        ORDER_ACCESS_SECRET: SECRET,
      }),
    ).toThrow("Invalid test-app configuration: AUTH_SECRET: is still the example placeholder");
  });

  it("staging and production require the edge header, secrets and TLS", () => {
    const live = { ...local, STOREVIA_ENV: "production" };
    expect(() => loadEnv("test-app", schema, rules, live)).toThrow(
      /ORDER_ACCESS_SECRET: required outside development and test; TRUSTED_CLIENT_IP_HEADER: required in staging and production; DATABASE_URL: must require TLS/,
    );
    const ok = loadEnv("test-app", schema, rules, {
      ...live,
      DATABASE_URL: "postgresql://app:pw@ep-x.neon.tech/storevia?sslmode=require",
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      ORDER_ACCESS_SECRET: SECRET,
    });
    expect(ok.STOREVIA_ENV).toBe("production");
  });

  it("preview needs the non-local secrets but not the live edge rules", () => {
    expect(() => loadEnv("test-app", schema, rules, { ...local, STOREVIA_ENV: "preview" })).toThrow(
      /ORDER_ACCESS_SECRET: required outside development and test$/,
    );
  });
});

describe("databaseUrlUsesTls", () => {
  it.each([
    ["postgresql://a:b@h/db?sslmode=require", true],
    ["postgresql://a:b@h/db?sslmode=verify-full", true],
    ["postgresql://a:b@h/db?sslmode=prefer", false],
    ["postgresql://a:b@h/db", false],
    ["not a url", false],
  ])("%s", (url, expected) => {
    expect(databaseUrlUsesTls(url)).toBe(expected);
  });
});

describe("runBootChecks", () => {
  it("reports every failing check, thrown or returned", () => {
    expect(() => {
      runBootChecks("test-app", {
        fine: () => null,
        returned: () => "PAYMENT_CREDENTIALS_KEYS is not set",
        thrown: () => {
          throw new Error("SMTP_URL is not set");
        },
      });
    }).toThrow(
      "Invalid test-app configuration: returned: PAYMENT_CREDENTIALS_KEYS is not set; thrown: SMTP_URL is not set",
    );
    expect(() => {
      runBootChecks("test-app", { fine: () => undefined });
    }).not.toThrow();
  });
});
