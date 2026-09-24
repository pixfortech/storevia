import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assessRuntime,
  engineFloorMajor,
  latestStable,
  nodeReleases,
  plan,
} from "./toolchain-check.mjs";

const index = [
  { version: "v26.10.0", lts: false },
  { version: "v25.9.0", lts: false },
  { version: "v24.21.0", lts: "Krypton" },
  { version: "v24.16.0", lts: "Krypton" },
  { version: "v22.23.3", lts: "Jod" },
];

test("stable versions only, optionally within a major", () => {
  assert.equal(latestStable(["10.33.0", "10.34.5", "11.0.0-rc.1", "12.6.0"], 10), "10.34.5");
  assert.equal(latestStable(["10.33.0", "12.6.0", "12.7.0-beta.0"]), "12.6.0");
});

test("Node release channels", () => {
  const node = nodeReleases(index);
  assert.equal(node.latestLts, "v24.21.0");
  assert.equal(node.latestCurrentMajor, 26);
  assert.equal(node.latestInMajor(24), "v24.21.0");
});

test("engines.node must stay a plain floor, never a capped range", () => {
  assert.equal(engineFloorMajor(">=24"), 24);
  assert.throws(() => engineFloorMajor(">=22.12.0 <23"));
});

test("the repository's own engines range is a floor", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(engineFloorMajor(pkg.engines.node) >= 24);
  assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+/);
});

test("same-major pnpm updates become pull requests; majors are reviewed", () => {
  const actions = plan({
    packageManager: "pnpm@10.33.0",
    pnpmVersions: ["10.33.0", "10.34.5", "11.27.1", "12.6.0"],
    primaryMajor: 24,
    node: nodeReleases(index),
  });
  assert.deepEqual(
    actions.map((a) => [a.kind, a.to, a.proposal]),
    [
      ["pnpm-update", "10.34.5", "pull-request"],
      ["pnpm-major", "12.6.0", "review"],
    ],
  );
});

test("a newer LTS major is proposed as a promotion", () => {
  const node = nodeReleases([{ version: "v26.11.0", lts: "Next" }, ...index]);
  const actions = plan({
    packageManager: "pnpm@10.34.5",
    pnpmVersions: ["10.34.5"],
    primaryMajor: 24,
    node,
  });
  assert.deepEqual(actions, [
    { kind: "node-lts-promotion", from: 24, to: 26, proposal: "pull-request" },
  ]);
});

test("gitleaks releases are reported for review", () => {
  const actions = plan({
    packageManager: "pnpm@10.34.5",
    pnpmVersions: ["10.34.5"],
    primaryMajor: 24,
    node: nodeReleases(index),
    gitleaks: { current: "8.30.1", latest: "8.31.0" },
  });
  assert.equal(actions[0]?.kind, "gitleaks-update");
});

test("local runtime assessment", () => {
  const policy = { floorMajor: 24, primaryMajor: 24, node: nodeReleases(index) };
  assert.equal(assessRuntime("v22.22.2", policy).level, "unsupported");
  assert.equal(assessRuntime("v24.16.0", policy).level, "supported");
  assert.equal(assessRuntime("v26.10.0", policy).level, "canary");
  assert.equal(assessRuntime("v27.0.0", policy).level, "untested");
});
