import { describe, expect, it } from "vitest";
import {
  ACTIONS_WIDTH_PX,
  SWIPE_START_PX,
  TAP_MAX_MOVE_PX,
  isTapGesture,
  shouldAbortForScroll,
  shouldStartSwipe,
  snapSwipeOffset,
} from "../../src/links/swipe";

describe("ACTIONS_WIDTH_PX", () => {
  it("is sized for a single action per side", () => {
    expect(ACTIONS_WIDTH_PX).toBe(72);
  });
});

describe("snapSwipeOffset", () => {
  const w = ACTIONS_WIDTH_PX;

  it("stays closed when barely moved either way", () => {
    expect(snapSwipeOffset(-10, w, 0)).toBe(0);
    expect(snapSwipeOffset(10, w, 0)).toBe(0);
  });

  it("opens delete (negative) past open ratio", () => {
    expect(snapSwipeOffset(-(w * 0.35), w, 0)).toBe(-w);
  });

  it("opens edit (positive) past open ratio", () => {
    expect(snapSwipeOffset(w * 0.35, w, 0)).toBe(w);
  });

  it("opens delete on fast left flick", () => {
    expect(snapSwipeOffset(-20, w, -0.25)).toBe(-w);
  });

  it("opens edit on fast right flick", () => {
    expect(snapSwipeOffset(20, w, 0.25)).toBe(w);
  });

  it("closes toward zero on opposing velocity from delete open", () => {
    expect(snapSwipeOffset(-(w * 0.5), w, 0.6)).toBe(0);
  });

  it("closes toward zero on opposing velocity from edit open", () => {
    expect(snapSwipeOffset(w * 0.5, w, -0.6)).toBe(0);
  });

  it("clamps to ±actionWidth", () => {
    expect(snapSwipeOffset(-999, w, 0)).toBe(-w);
    expect(snapSwipeOffset(999, w, 0)).toBe(w);
  });
});

describe("shouldStartSwipe", () => {
  it("starts when horizontal dominates past threshold", () => {
    expect(shouldStartSwipe(SWIPE_START_PX, 1)).toBe(true);
  });

  it("does not start on vertical-dominant move", () => {
    expect(shouldStartSwipe(5, 20)).toBe(false);
  });
});

describe("shouldAbortForScroll", () => {
  it("aborts on clear vertical scroll intent", () => {
    expect(shouldAbortForScroll(5, 30)).toBe(true);
  });

  it("does not abort on small vertical jitter", () => {
    expect(shouldAbortForScroll(2, 10)).toBe(false);
  });
});

describe("isTapGesture", () => {
  it("treats small movement as a tap", () => {
    expect(isTapGesture(0)).toBe(true);
    expect(isTapGesture(TAP_MAX_MOVE_PX)).toBe(true);
  });

  it("rejects larger movement", () => {
    expect(isTapGesture(TAP_MAX_MOVE_PX + 1)).toBe(false);
  });
});
