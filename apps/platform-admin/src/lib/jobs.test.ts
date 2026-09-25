import type { JobHealth, JobRunSummary } from "@storevia/billing";
import { describe, expect, it } from "vitest";
import { jobHealth, jobInterval, jobsSummary, needsAttention, runTone } from "./jobs";

const job = (overrides: Partial<JobHealth> = {}): JobHealth => ({
  name: "subscriptions.expire",
  intervalSeconds: 900,
  nextRunAt: new Date("2026-09-25T12:15:00Z"),
  lastStartedAt: null,
  lastFinishedAt: null,
  lastStatus: null,
  consecutiveFailures: 0,
  running: false,
  stalled: false,
  ...overrides,
});

const run = (startedAt: string, status: JobRunSummary["status"] = "SUCCEEDED") =>
  ({ id: startedAt, jobName: "x", status, startedAt: new Date(startedAt) }) as JobRunSummary;

describe("jobInterval", () => {
  it("names days, hours, minutes and seconds", () => {
    expect(jobInterval(86_400)).toBe("Daily");
    expect(jobInterval(172_800)).toBe("Every 2 days");
    expect(jobInterval(21_600)).toBe("Every 6 h");
    expect(jobInterval(900)).toBe("Every 15 min");
    expect(jobInterval(45)).toBe("Every 45 s");
  });
});

describe("jobHealth", () => {
  it("ranks stalled over running over failing over healthy", () => {
    expect(jobHealth(job({ stalled: true, running: true })).label).toBe("Stalled");
    expect(jobHealth(job({ running: true, consecutiveFailures: 2 })).label).toBe("Running");
    expect(jobHealth(job({ consecutiveFailures: 2 }))).toEqual({
      tone: "warning",
      label: "Failing (2)",
    });
    expect(jobHealth(job({ lastStatus: "SUCCEEDED" })).tone).toBe("success");
    expect(jobHealth(job()).label).toBe("Not run yet");
  });

  it("marks stalled and failing jobs as needing attention", () => {
    expect(needsAttention(job({ stalled: true }))).toBe(true);
    expect(needsAttention(job({ consecutiveFailures: 1 }))).toBe(true);
    expect(needsAttention(job({ running: true }))).toBe(false);
  });
});

describe("runTone", () => {
  it("maps run results to tones", () => {
    expect(runTone("SUCCEEDED")).toBe("success");
    expect(runTone("FAILED")).toBe("danger");
    expect(runTone("RUNNING")).toBe("info");
  });
});

describe("jobsSummary", () => {
  it("counts healthy and failing jobs and finds the latest run", () => {
    const summary = jobsSummary(
      [job({ lastStatus: "SUCCEEDED" }), job({ consecutiveFailures: 1 }), job()],
      [run("2026-09-25T10:00:00Z"), run("2026-09-25T11:00:00Z", "FAILED")],
    );
    expect(summary).toEqual({
      total: 3,
      healthy: 1,
      attention: 1,
      lastRunAt: new Date("2026-09-25T11:00:00Z"),
    });
  });

  it("has no last run before the worker has run anything", () => {
    expect(jobsSummary([], []).lastRunAt).toBeNull();
  });
});
