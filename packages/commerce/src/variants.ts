// Option edits and variant reconciliation (ADR-0027 §5). Pure: the service
// loads the product's options and variants, asks this module for a plan,
// shows the merchant what the plan would remove, and applies it only when the
// merchant has confirmed exactly those variants. Client-safe, so the editor
// previews the same plan the server will apply.

export const OPTION_LIMITS = {
  maxOptions: 3,
  maxValuesPerOption: 50,
  maxVariants: 100,
  maxNameLength: 255,
} as const;

export interface CurrentOption {
  readonly id: string;
  readonly name: string;
  readonly values: readonly { readonly id: string; readonly value: string }[];
}

export interface CurrentVariant {
  readonly id: string;
  /** optionId → valueId. Empty for the default variant of a product without options. */
  readonly values: Readonly<Record<string, string>>;
}

export interface DesiredOption {
  /** An existing option's id, or undefined for a new option. */
  readonly id?: string | undefined;
  readonly name: string;
  readonly values: readonly {
    /** An existing value's id (of this same option), or undefined for a new value. */
    readonly id?: string | undefined;
    readonly value: string;
  }[];
}

/**
 * A value in the plan: an existing value id, or `new:<option>:<value>` for a
 * value the service will create (indices into the desired options).
 */
export type ValueKey = string;

export interface PlannedOption {
  readonly id: string | undefined;
  readonly name: string;
  readonly position: number;
  readonly values: readonly {
    readonly key: ValueKey;
    readonly id: string | undefined;
    readonly value: string;
    readonly position: number;
  }[];
}

export interface OptionPlan {
  readonly options: readonly PlannedOption[];
  readonly removedOptionIds: readonly string[];
  readonly removedValueIds: readonly string[];
  /** Variants that survive, with their new value combination (in option order). */
  readonly keep: readonly {
    readonly variantId: string;
    readonly combination: readonly ValueKey[];
  }[];
  /** Combinations that get new variants. */
  readonly create: readonly (readonly ValueKey[])[];
  /** Variants whose combination no longer exists. Needs confirmation. */
  readonly remove: readonly string[];
}

export class OptionPlanError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "OptionPlanError";
  }
}

const normalise = (text: string) => text.trim().replace(/\s+/g, " ");
const fold = (text: string) => normalise(text).toLocaleLowerCase("en");

/** The stored signature of a combination: value ids in option order. "" when there are no options. */
export function optionSignature(valueIds: readonly string[]): string {
  return valueIds.join("/");
}

/** "Red / Large", or "Default" for a product without options. */
export function variantTitle(values: readonly string[]): string {
  return values.length === 0 ? "Default" : values.join(" / ");
}

function validate(current: readonly CurrentOption[], desired: readonly DesiredOption[]): void {
  if (desired.length > OPTION_LIMITS.maxOptions) {
    throw new OptionPlanError(
      `A product can have at most ${String(OPTION_LIMITS.maxOptions)} options.`,
      "options",
    );
  }
  const currentById = new Map(current.map((o) => [o.id, o]));
  const names = new Set<string>();
  const seenOptionIds = new Set<string>();
  let combinations = 1;
  desired.forEach((option, i) => {
    const name = normalise(option.name);
    if (!name) throw new OptionPlanError("Enter an option name.", `options.${String(i)}.name`);
    if (name.length > OPTION_LIMITS.maxNameLength) {
      throw new OptionPlanError("The option name is too long.", `options.${String(i)}.name`);
    }
    if (names.has(fold(name))) {
      throw new OptionPlanError("Option names must be different.", `options.${String(i)}.name`);
    }
    names.add(fold(name));
    if (option.id !== undefined) {
      if (!currentById.has(option.id) || seenOptionIds.has(option.id)) {
        throw new OptionPlanError("That option no longer exists. Reload and try again.", "options");
      }
      seenOptionIds.add(option.id);
    }
    if (option.values.length === 0) {
      throw new OptionPlanError("Add at least one value.", `options.${String(i)}.values`);
    }
    if (option.values.length > OPTION_LIMITS.maxValuesPerOption) {
      throw new OptionPlanError(
        `An option can have at most ${String(OPTION_LIMITS.maxValuesPerOption)} values.`,
        `options.${String(i)}.values`,
      );
    }
    const ownValueIds = new Set(
      option.id === undefined ? [] : (currentById.get(option.id)?.values ?? []).map((v) => v.id),
    );
    const values = new Set<string>();
    const seenValueIds = new Set<string>();
    option.values.forEach((value, j) => {
      const text = normalise(value.value);
      const field = `options.${String(i)}.values.${String(j)}`;
      if (!text) throw new OptionPlanError("Enter a value.", field);
      if (text.length > OPTION_LIMITS.maxNameLength)
        throw new OptionPlanError("The value is too long.", field);
      if (values.has(fold(text))) throw new OptionPlanError("Values must be different.", field);
      values.add(fold(text));
      if (value.id !== undefined) {
        // A value can't move to another option (its variants' meaning would change).
        if (!ownValueIds.has(value.id) || seenValueIds.has(value.id)) {
          throw new OptionPlanError("That value no longer exists. Reload and try again.", field);
        }
        seenValueIds.add(value.id);
      }
    });
    combinations *= option.values.length;
  });
  if (combinations > OPTION_LIMITS.maxVariants) {
    throw new OptionPlanError(
      `These options make ${String(combinations)} variants; the limit is ${String(OPTION_LIMITS.maxVariants)}.`,
      "options",
    );
  }
}

function cartesian(lists: readonly (readonly ValueKey[])[]): ValueKey[][] {
  return lists.reduce<ValueKey[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((key) => [...prefix, key])),
    [[]],
  );
}

/**
 * Plans an option edit. Variants whose combination survives keep their id
 * (and with it SKU, prices, inventory and media); an added option gives
 * existing variants its first value; removing an option keeps the first
 * variant (in the given order) for each remaining combination. Throws
 * OptionPlanError for invalid input.
 *
 * `variants` must be the product's live variants in display order.
 */
export function planOptionChange(
  current: readonly CurrentOption[],
  variants: readonly CurrentVariant[],
  desired: readonly DesiredOption[],
): OptionPlan {
  validate(current, desired);

  const planned: PlannedOption[] = desired.map((option, i) => ({
    id: option.id,
    name: normalise(option.name),
    position: i,
    values: option.values.map((value, j) => ({
      key: value.id ?? `new:${String(i)}:${String(j)}`,
      id: value.id,
      value: normalise(value.value),
      position: j,
    })),
  }));

  const keptOptionIds = new Set(desired.flatMap((o) => (o.id === undefined ? [] : [o.id])));
  const keptValueIds = new Set(
    desired.flatMap((o) => o.values.flatMap((v) => (v.id ? [v.id] : []))),
  );
  const removedOptionIds = current.filter((o) => !keptOptionIds.has(o.id)).map((o) => o.id);
  const removedValueIds = current
    .filter((o) => keptOptionIds.has(o.id))
    .flatMap((o) => o.values.filter((v) => !keptValueIds.has(v.id)).map((v) => v.id));

  const keep: { variantId: string; combination: ValueKey[] }[] = [];
  const remove: string[] = [];
  const claimed = new Set<string>();

  for (const variant of variants) {
    const combination: ValueKey[] = [];
    let lost = false;
    for (const option of planned) {
      const first = option.values[0];
      if (!first) throw new OptionPlanError("Add at least one value.", "options");
      if (option.id === undefined) {
        combination.push(first.key);
        continue;
      }
      const held = variant.values[option.id];
      if (held === undefined) {
        // The variant predates this option (it was the default variant).
        combination.push(first.key);
      } else if (option.values.some((v) => v.id === held)) {
        combination.push(held);
      } else {
        lost = true;
        break;
      }
    }
    const signature = combination.join("/");
    if (lost || claimed.has(signature)) {
      remove.push(variant.id);
    } else {
      claimed.add(signature);
      keep.push({ variantId: variant.id, combination });
    }
  }

  const create = cartesian(planned.map((o) => o.values.map((v) => v.key))).filter(
    (combination) => !claimed.has(combination.join("/")),
  );

  return { options: planned, removedOptionIds, removedValueIds, keep, create, remove };
}

/** True when applying the plan changes nothing about variants. */
export function isNoopPlan(plan: OptionPlan): boolean {
  return plan.create.length === 0 && plan.remove.length === 0;
}
