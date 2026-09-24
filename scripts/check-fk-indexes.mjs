// Fails when a relation's first foreign-key column is not the leading column
// of some index/unique/primary key in the model (docs/database/erd.md §5).
// Usage: node scripts/check-fk-indexes.mjs <schema.prisma> [...]
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: check-fk-indexes.mjs <schema.prisma> [...]");
  process.exit(2);
}

let failures = 0;
for (const file of files) {
  const schema = readFileSync(file, "utf8");
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const leading = new Set();
    for (const [, cols] of body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)) {
      leading.add(cols.split(",")[0].trim());
    }
    for (const [, field] of body.matchAll(/^\s+(\w+)\s+\S+.*@(?:id|unique)\b/gm)) {
      leading.add(field);
    }
    for (const [, cols] of body.matchAll(/@relation\((?:"[^"]*",\s*)?fields: \[([^\]]+)\]/g)) {
      const first = cols.split(",")[0].trim();
      if (!leading.has(first)) {
        console.error(`${file}: ${model}.${first} is a foreign key without a leading index`);
        failures += 1;
      }
    }
  }
}
if (failures > 0) process.exit(1);
console.log(`FK index check passed (${files.join(", ")})`);
