import { describe, expect, it } from "vitest";
import {
  MAX_POSES,
  POSE_NOTE_MAX,
  draftsToPoseRefs,
  moveItem,
  poseDraftsFromRefs,
  poseRefsError,
  readPoseRefs,
} from "../../src/links/poses";

describe("draftsToPoseRefs", () => {
  it("returns null when there is nothing to save", () => {
    expect(draftsToPoseRefs([])).toBeNull();
    expect(draftsToPoseRefs([{ url: " ", note: "" }])).toBeNull();
  });

  it("keeps order, trims and omits empty parts", () => {
    expect(
      draftsToPoseRefs([
        { url: " https://example.com/a ", note: "" },
        { url: "", note: " de lado " },
        { url: "", note: "" },
        { url: "https://example.com/b", note: "sentada" },
      ])
    ).toEqual([
      { url: "https://example.com/a" },
      { note: "de lado" },
      { url: "https://example.com/b", note: "sentada" },
    ]);
  });
});

describe("poseRefsError", () => {
  it("accepts an empty list and valid poses", () => {
    expect(poseRefsError([])).toBeNull();
    expect(poseRefsError([{ url: "https://example.com/a", note: "" }])).toBeNull();
    expect(poseRefsError([{ url: "", note: "só nota" }])).toBeNull();
    expect(poseRefsError([{ url: "", note: "" }])).toBeNull();
  });

  it("rejects non-https links naming the pose number", () => {
    expect(poseRefsError([{ url: "http://example.com", note: "" }])).toBe(
      "Pose 1: Link da pose precisa ser uma URL https válida."
    );
    expect(
      poseRefsError([
        { url: "https://example.com", note: "" },
        { url: "javascript:alert(1)", note: "" },
      ])
    ).toMatch(/^Pose 2:/);
  });

  it("rejects too many poses and over-long notes", () => {
    const many = Array.from({ length: MAX_POSES + 1 }, () => ({ url: "", note: "x" }));
    expect(poseRefsError(many)).toMatch(String(MAX_POSES));
    expect(poseRefsError([{ url: "", note: "x".repeat(POSE_NOTE_MAX + 1) }])).toMatch(
      /Pose 1:.*500/
    );
  });
});

describe("readPoseRefs / poseDraftsFromRefs", () => {
  it("sanitises stored json defensively", () => {
    expect(readPoseRefs(null)).toEqual([]);
    expect(readPoseRefs("x")).toEqual([]);
    expect(
      readPoseRefs([
        { url: "https://example.com/a", note: "n" },
        { url: "javascript:alert(1)", note: "ok" },
        { url: 3 },
        null,
        {},
        { note: "só" },
      ])
    ).toEqual([{ url: "https://example.com/a", note: "n" }, { note: "ok" }, { note: "só" }]);
  });

  it("converts refs to editable drafts", () => {
    expect(poseDraftsFromRefs([{ url: "https://example.com/a" }, { note: "n" }])).toEqual([
      { url: "https://example.com/a", note: "" },
      { url: "", note: "n" },
    ]);
  });
});

describe("moveItem", () => {
  it("moves without mutating and ignores out-of-range moves", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(list, 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(list, 2, 3)).toEqual(["a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});
