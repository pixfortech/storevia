import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classify, level, matches } from "./dependency-policy.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../.github/dependency-policy.json", import.meta.url), "utf8"),
);
const dep = (
  dependencyName,
  updateType,
  dependencyType = "direct:development",
  prevVersion = "1.2.3",
) => ({
  dependencyName,
  updateType: `version-update:semver-${updateType}`,
  dependencyType,
  prevVersion,
});

test("patterns match scopes and exact names only", () => {
  assert.ok(matches("@prisma/client", ["@prisma/*"]));
  assert.ok(!matches("prisma-extra", ["prisma"]));
});

test("majors are never merged automatically", () => {
  const result = classify([dep("lucide-react", "major", "direct:production")], policy);
  assert.equal(result.decision, "review");
});

test("0.x minor updates count as majors", () => {
  assert.equal(level(dep("some-tool", "minor", "direct:development", "0.4.1")), "major");
});

test("low-risk patches merge after CI", () => {
  assert.equal(
    classify([dep("lucide-react", "patch", "direct:production")], policy).decision,
    "auto-merge",
  );
  assert.equal(classify([dep("typescript", "patch")], policy).decision, "auto-merge");
});

test("high-risk packages always need review, even patches", () => {
  for (const name of ["next", "react", "@prisma/client", "better-auth", "@node-rs/argon2", "pg"]) {
    assert.equal(
      classify([dep(name, "patch", "direct:production")], policy).decision,
      "review",
      name,
    );
  }
});

test("minors: development dependencies merge, production and core frameworks are reviewed", () => {
  assert.equal(classify([dep("globals", "minor")], policy).decision, "auto-merge");
  assert.equal(
    classify([dep("lucide-react", "minor", "direct:production")], policy).decision,
    "review",
  );
  assert.equal(classify([dep("vitest", "minor")], policy).decision, "review");
});

test("a group merges only if every member qualifies", () => {
  const group = [dep("globals", "patch"), dep("next", "patch", "direct:production")];
  assert.equal(classify(group, policy).decision, "review");
});

test("workflow action updates and maintainer changes are reviewed", () => {
  assert.equal(
    classify([dep("actions/checkout", "patch")], policy, { ecosystem: "github_actions" }).decision,
    "review",
  );
  assert.equal(
    classify([dep("globals", "patch")], policy, { maintainerChanges: true }).decision,
    "review",
  );
});

test("missing metadata is never merged", () => {
  assert.equal(classify([], policy).decision, "review");
});
