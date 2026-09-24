// ADR-0020: every model/enum in the live schema must exist in the draft ERD
// schema with identical scalar fields, attributes, block attributes and enum
// values. Relation fields are ignored (the live schema omits back-relations to
// models that have not been promoted yet).
// Usage: node scripts/check-schema-agreement.mjs <live.prisma> <draft.prisma>
import { readFileSync } from "node:fs";

const [livePath, draftPath] = process.argv.slice(2);
if (!livePath || !draftPath) {
  console.error("usage: check-schema-agreement.mjs <live.prisma> <draft.prisma>");
  process.exit(2);
}

function parse(path) {
  const text = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trimEnd())
    .join("\n");
  const models = new Map();
  const enums = new Map();
  for (const [, kind, name, body] of text.matchAll(/^(model|enum) (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const lines = body
      .split("\n")
      .map((l) => l.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (kind === "enum") enums.set(name, new Set(lines));
    else models.set(name, lines);
  }
  return { models, enums };
}

const live = parse(livePath);
const draft = parse(draftPath);
const typeNames = new Set([...draft.models.keys(), ...live.models.keys()]);
const errors = [];

for (const [name, values] of live.enums) {
  const other = draft.enums.get(name);
  if (!other) errors.push(`enum ${name} is not in the draft`);
  else if ([...values].join() !== [...other].join())
    errors.push(`enum ${name} values differ from the draft`);
}

for (const [name, lines] of live.models) {
  const other = draft.models.get(name);
  if (!other) {
    errors.push(`model ${name} is not in the draft`);
    continue;
  }
  const draftFields = new Map(
    other.filter((l) => !l.startsWith("@@")).map((l) => [l.split(" ")[0], l]),
  );
  const draftBlock = new Set(other.filter((l) => l.startsWith("@@")));
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (!draftBlock.has(line)) errors.push(`${name}: "${line}" is not in the draft`);
      continue;
    }
    const [field, type] = line.split(" ");
    const baseType = (type ?? "").replace(/[?[\]]/g, "");
    if (typeNames.has(baseType)) continue; // relation field
    const expected = draftFields.get(field);
    if (!expected) errors.push(`${name}.${field} is not in the draft`);
    else if (expected !== line)
      errors.push(`${name}.${field} differs:\n    live:  ${line}\n    draft: ${expected}`);
  }
}

if (errors.length > 0) {
  console.error(`Live schema disagrees with the draft ERD (ADR-0020):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Schema agreement check passed (${live.models.size} live models)`);
