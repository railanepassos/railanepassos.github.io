// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DURATIONS,
  DURATION_LABELS,
  durationLabel,
  durationRank,
  fitsDuration,
  isDuration,
  readDuration,
} from "../../src/links/duration";
import { DRAFT_LIMITS } from "../../src/links/draft";

describe("values stay in sync with migration 020 and the draft codec", () => {
  const sql: string = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/020_links_duration.sql", import.meta.url)),
    "utf8"
  );
  it("migration lists exactly the values", () => {
    const list = DURATIONS.map((d) => `'${d}'`).join(", ");
    expect(sql).toContain(`check (duration in (${list}))`);
  });
  it("draft codec mirrors them", () => {
    expect(DRAFT_LIMITS.durations).toEqual([...DURATIONS]);
  });
});

describe("duration helpers", () => {
  it("labels in pt-BR, ordered shortest to longest", () => {
    expect(DURATIONS).toEqual(["rapido", "meio-periodo", "dia-inteiro"]);
    expect(DURATIONS.map((d) => DURATION_LABELS[d])).toEqual([
      "Rápido (até 2h)",
      "Meio período",
      "Dia inteiro",
    ]);
  });

  it("isDuration / readDuration accept only known values", () => {
    expect(isDuration("rapido")).toBe(true);
    for (const bad of ["", "Rápido", null, undefined, 3, {}]) {
      expect(isDuration(bad)).toBe(false);
      expect(readDuration(bad)).toBeNull();
    }
    expect(readDuration("dia-inteiro")).toBe("dia-inteiro");
  });

  it("durationLabel returns null without a valid value", () => {
    expect(durationLabel("meio-periodo")).toBe("Meio período");
    expect(durationLabel(null)).toBeNull();
    expect(durationLabel("x")).toBeNull();
  });

  it("durationRank orders and flags missing as -1", () => {
    expect(durationRank("rapido")).toBe(0);
    expect(durationRank("meio-periodo")).toBe(1);
    expect(durationRank("dia-inteiro")).toBe(2);
    expect(durationRank(null)).toBe(-1);
  });

  it("fitsDuration: at most the limit, never without a duration", () => {
    expect(fitsDuration("rapido", "meio-periodo")).toBe(true);
    expect(fitsDuration("meio-periodo", "meio-periodo")).toBe(true);
    expect(fitsDuration("dia-inteiro", "meio-periodo")).toBe(false);
    expect(fitsDuration(null, "dia-inteiro")).toBe(false);
  });
});
