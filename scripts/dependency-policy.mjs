// Classifies a Dependabot pull request against .github/dependency-policy.json
// (docs/engineering/toolchain-policy.md §5). Pure rules in `classify`; the
// CLI reads fetch-metadata outputs from the environment and writes
// `decision=auto-merge|review` to $GITHUB_OUTPUT.
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** `@prisma/*` matches every @prisma package; other patterns match exactly. */
export function matches(name, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith("/*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

const LEVELS = {
  "version-update:semver-patch": "patch",
  "version-update:semver-minor": "minor",
  "version-update:semver-major": "major",
};

/** The effective change: 0.x minors are breaking by semver convention. */
export function level(dependency) {
  const declared = LEVELS[dependency.updateType] ?? "major";
  const previousMajor = Number(String(dependency.prevVersion ?? "").split(".")[0]);
  if (declared === "minor" && previousMajor === 0) return "major";
  return declared;
}

/**
 * @param {Array<{dependencyName: string, dependencyType?: string, updateType?: string, prevVersion?: string}>} dependencies
 * @param {object} policy parsed .github/dependency-policy.json
 * @param {{ecosystem?: string, maintainerChanges?: boolean}} context
 * @returns {{decision: "auto-merge" | "review", reasons: string[]}}
 */
export function classify(dependencies, policy, context = {}) {
  const reasons = [];
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    reasons.push("no dependency metadata");
  }
  if (context.ecosystem && policy.reviewEcosystems.ecosystems.includes(context.ecosystem)) {
    reasons.push(`${context.ecosystem} updates are always reviewed`);
  }
  if (context.maintainerChanges) reasons.push("maintainers changed (supply-chain signal)");
  for (const dependency of dependencies ?? []) {
    const name = dependency.dependencyName;
    const change = level(dependency);
    const development = dependency.dependencyType === "direct:development";
    if (change === "major") {
      reasons.push(`${name}: major update (changelog and breaking-change review)`);
    } else if (matches(name, policy.highRisk.patterns)) {
      reasons.push(`${name}: high-risk package (${change})`);
    } else if (change === "minor" && matches(name, policy.coreFrameworks.patterns)) {
      reasons.push(`${name}: core framework minor`);
    } else if (change === "minor" && (!policy.autoMerge.minorDevelopmentOnly || !development)) {
      if (policy.autoMerge.minorDevelopmentOnly)
        reasons.push(`${name}: production dependency minor`);
    } else if (change === "patch" && !policy.autoMerge.patch) {
      reasons.push(`${name}: patch auto-merge disabled`);
    }
  }
  return { decision: reasons.length === 0 ? "auto-merge" : "review", reasons };
}

/** fetch-metadata's JSON list; anything unreadable counts as no metadata (review). */
function parseDependencies(text) {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function main() {
  const policyPath = new URL("../.github/dependency-policy.json", import.meta.url);
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const dependencies = parseDependencies(process.env.UPDATED_DEPENDENCIES_JSON);
  const result = classify(dependencies, policy, {
    ecosystem: process.env.PACKAGE_ECOSYSTEM,
    maintainerChanges: process.env.MAINTAINER_CHANGES === "true",
  });
  const lines = [
    `Decision: **${result.decision}**`,
    ...dependencies.map(
      (d) => `- ${d.dependencyName} ${d.prevVersion ?? "?"} → ${d.newVersion ?? "?"} (${level(d)})`,
    ),
    ...result.reasons.map((reason) => `- Review: ${reason}`),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `decision=${result.decision}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
