import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  OptionPlanError,
  optionSignature,
  planOptionChange,
  variantTitle,
  type CurrentOption,
  type CurrentVariant,
  type DesiredOption,
} from "./variants";

const size: CurrentOption = {
  id: "opt-size",
  name: "Size",
  values: [
    { id: "s", value: "S" },
    { id: "m", value: "M" },
    { id: "l", value: "L" },
  ],
};
const colour: CurrentOption = {
  id: "opt-colour",
  name: "Colour",
  values: [
    { id: "red", value: "Red" },
    { id: "blue", value: "Blue" },
  ],
};

const keepAll = (option: CurrentOption): DesiredOption => ({
  id: option.id,
  name: option.name,
  values: option.values.map((v) => ({ id: v.id, value: v.value })),
});

function variantsOf(options: readonly CurrentOption[]): CurrentVariant[] {
  const combos = options.reduce<Record<string, string>[]>(
    (acc, option) =>
      acc.flatMap((prefix) => option.values.map((v) => ({ ...prefix, [option.id]: v.id }))),
    [{}],
  );
  return combos.map((values, i) => ({ id: `v${String(i)}`, values }));
}

describe("planOptionChange", () => {
  it("a product without options has one default variant", () => {
    const plan = planOptionChange([], [], []);
    expect(plan.create).toEqual([[]]);
    expect(optionSignature([])).toBe("");
    expect(variantTitle([])).toBe("Default");
  });

  it("adding the first option keeps the default variant as the first value", () => {
    const plan = planOptionChange(
      [],
      [{ id: "default", values: {} }],
      [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
    );
    expect(plan.keep).toEqual([{ variantId: "default", combination: ["new:0:0"] }]);
    expect(plan.create).toEqual([["new:0:1"]]);
    expect(plan.remove).toEqual([]);
  });

  it("adding a value creates only the new combinations", () => {
    const variants = variantsOf([size, colour]);
    const plan = planOptionChange([size, colour], variants, [
      keepAll(size),
      { ...keepAll(colour), values: [...keepAll(colour).values, { value: "Green" }] },
    ]);
    expect(plan.keep).toHaveLength(6);
    expect(plan.create).toEqual([
      ["s", "new:1:2"],
      ["m", "new:1:2"],
      ["l", "new:1:2"],
    ]);
    expect(plan.remove).toEqual([]);
  });

  it("renaming and reordering keep every variant", () => {
    const variants = variantsOf([size, colour]);
    const plan = planOptionChange([size, colour], variants, [
      { ...keepAll(colour), name: "Color", values: [...keepAll(colour).values].reverse() },
      {
        ...keepAll(size),
        values: keepAll(size).values.map((v) => ({ ...v, value: `${v.value}!` })),
      },
    ]);
    expect(plan.keep).toHaveLength(6);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep[0]?.combination).toEqual(["red", "s"]);
  });

  it("removing a value removes exactly its variants", () => {
    const variants = variantsOf([size, colour]);
    const plan = planOptionChange([size, colour], variants, [
      { ...keepAll(size), values: keepAll(size).values.filter((v) => v.id !== "m") },
      keepAll(colour),
    ]);
    const removed = variants.filter((v) => v.values["opt-size"] === "m").map((v) => v.id);
    expect(plan.remove).toEqual(removed);
    expect(plan.removedValueIds).toEqual(["m"]);
    expect(plan.create).toEqual([]);
  });

  it("removing an option keeps the first variant of each remaining combination", () => {
    const variants = variantsOf([size, colour]);
    const plan = planOptionChange([size, colour], variants, [keepAll(size)]);
    expect(plan.removedOptionIds).toEqual(["opt-colour"]);
    expect(plan.keep.map((k) => k.combination)).toEqual([["s"], ["m"], ["l"]]);
    expect(plan.remove).toHaveLength(3);
    expect(plan.create).toEqual([]);
  });

  it("removing every option collapses to one default variant", () => {
    const variants = variantsOf([size]);
    const plan = planOptionChange([size], variants, []);
    expect(plan.keep).toEqual([{ variantId: "v0", combination: [] }]);
    expect(plan.remove).toEqual(["v1", "v2"]);
  });

  it.each([
    [[{ name: "", values: [{ value: "a" }] }], "Enter an option name."],
    [[{ name: "Size", values: [] }], "Add at least one value."],
    [
      [
        { name: "Size", values: [{ value: "a" }] },
        { name: " size ", values: [{ value: "b" }] },
      ],
      "Option names must be different.",
    ],
    [[{ name: "Size", values: [{ value: "A" }, { value: "a " }] }], "Values must be different."],
    [
      [1, 2, 3, 4].map((n) => ({ name: `O${String(n)}`, values: [{ value: "x" }] })),
      "A product can have at most 3 options.",
    ],
    [
      [
        { name: "A", values: Array.from({ length: 11 }, (_, i) => ({ value: `a${String(i)}` })) },
        { name: "B", values: Array.from({ length: 10 }, (_, i) => ({ value: `b${String(i)}` })) },
      ],
      "These options make 110 variants; the limit is 100.",
    ],
  ] as [DesiredOption[], string][])("refuses invalid input: %#", (desired, message) => {
    expect(() => planOptionChange([], [], desired)).toThrow(message);
  });

  it("refuses ids that don't belong (stale or forged)", () => {
    expect(() =>
      planOptionChange([size], [], [{ id: "opt-other", name: "Size", values: [{ value: "S" }] }]),
    ).toThrow(OptionPlanError);
    // A value moved to another option would silently change variant meaning.
    expect(() =>
      planOptionChange(
        [size, colour],
        [],
        [{ ...keepAll(size), values: [{ id: "red", value: "Red" }] }, keepAll(colour)],
      ),
    ).toThrow(OptionPlanError);
  });
});

// Property: for any current state and any valid edit, the plan partitions the
// variants (nothing is lost silently), keeps each combination at most once,
// and together with creations covers exactly the new cartesian product.
describe("planOptionChange properties", () => {
  const currentArb = fc
    .array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 3 })
    .map((counts) =>
      counts.map<CurrentOption>((count, i) => ({
        id: `o${String(i)}`,
        name: `Option ${String(i)}`,
        values: Array.from({ length: count }, (_, j) => ({
          id: `o${String(i)}v${String(j)}`,
          value: `V${String(j)}`,
        })),
      })),
    );

  const editArb = (current: CurrentOption[]) =>
    fc
      .tuple(
        fc.subarray(current),
        fc.integer({ min: 0, max: Math.max(0, 3 - current.length) }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
      )
      .map(([kept, added, flags]) => {
        let f = 0;
        const flag = () => flags[f++ % flags.length] ?? true;
        const desired: DesiredOption[] = kept.map((o) => {
          const values = o.values.filter(() => flag());
          return {
            id: o.id,
            name: o.name,
            values: (values.length > 0 ? values : o.values.slice(0, 1)).map((v) => ({
              id: v.id,
              value: v.value,
            })),
          };
        });
        for (let n = 0; n < added; n += 1) {
          desired.push({ name: `New ${String(n)}`, values: [{ value: "x" }, { value: "y" }] });
        }
        return desired.slice(0, 3);
      });

  it("partitions variants and covers the product exactly", () => {
    fc.assert(
      fc.property(
        currentArb.chain((current) => fc.tuple(fc.constant(current), editArb(current))),
        ([current, desired]) => {
          const variants =
            current.length === 0 ? [{ id: "default", values: {} }] : variantsOf(current);
          const plan = planOptionChange(current, variants, desired);
          const keptIds = plan.keep.map((k) => k.variantId);
          expect(new Set([...keptIds, ...plan.remove]).size).toBe(variants.length);
          expect(keptIds.length + plan.remove.length).toBe(variants.length);
          const kept = plan.keep.map((k) => k.combination.join("/"));
          expect(new Set(kept).size).toBe(kept.length);
          const total = desired.reduce((n, o) => n * o.values.length, 1);
          expect(plan.keep.length + plan.create.length).toBe(total);
          // Every surviving combination's variant is kept, never removed.
          for (const variant of variants) {
            const survives = desired.every((o) => {
              if (o.id === undefined) return true;
              const held = variant.values[o.id];
              return held === undefined || o.values.some((v) => v.id === held);
            });
            if (!survives) expect(plan.remove).toContain(variant.id);
          }
        },
      ),
    );
  });
});
