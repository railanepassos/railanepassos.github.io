import { describe, expect, it } from "vitest";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  SCHEDULE_OFFSET,
  buildScheduleIso,
  formatScheduleChip,
  formatScheduleLabel,
  splitScheduleLocal,
  validateScheduleRange,
} from "../../src/links/schedule";

describe("schedule defaults", () => {
  it("uses 09:00–17:00", () => {
    expect(DEFAULT_START_TIME).toBe("09:00");
    expect(DEFAULT_END_TIME).toBe("17:00");
    expect(SCHEDULE_OFFSET).toBe("-03:00");
  });
});

describe("buildScheduleIso", () => {
  it("builds offset ISO for wall time in Sao Paulo", () => {
    expect(buildScheduleIso("2026-07-20", "09:00")).toBe(
      "2026-07-20T09:00:00-03:00"
    );
    expect(buildScheduleIso("2026-07-20", "17:00")).toBe(
      "2026-07-20T17:00:00-03:00"
    );
  });
});

describe("validateScheduleRange", () => {
  it("returns null when end is after start", () => {
    expect(
      validateScheduleRange(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toBeNull();
  });

  it("rejects empty or inverted range", () => {
    expect(validateScheduleRange("", "2026-07-20T17:00:00-03:00")).toMatch(
      /data/i
    );
    expect(
      validateScheduleRange(
        "2026-07-20T17:00:00-03:00",
        "2026-07-20T09:00:00-03:00"
      )
    ).toMatch(/depois|fim|início|inicio/i);
  });
});

describe("splitScheduleLocal", () => {
  it("splits ISO back to date and HH:MM", () => {
    expect(splitScheduleLocal("2026-07-20T09:00:00-03:00")).toEqual({
      date: "2026-07-20",
      time: "09:00",
    });
  });
});

describe("formatters", () => {
  it("formats chip and label", () => {
    expect(
      formatScheduleChip(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toBe("20 jul · 9–17");
    expect(
      formatScheduleLabel(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toMatch(/20 jul 2026/);
    expect(
      formatScheduleLabel(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toMatch(/09:00/);
  });
});
