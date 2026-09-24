import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("lets later utilities override earlier ones", () => {
    expect(cn("bg-surface text-ink", "text-danger-700")).toBe("bg-surface text-danger-700");
    expect(cn("h-10 px-4", "h-9")).toBe("px-4 h-9");
  });

  it("keeps custom type roles alongside colours", () => {
    expect(cn("text-h2 text-ink")).toBe("text-h2 text-ink");
    expect(cn("text-body text-ink-muted", "text-caption")).toBe("text-ink-muted text-caption");
    expect(cn("rounded-card shadow-card", "rounded-panel")).toBe("shadow-card rounded-panel");
  });
});
