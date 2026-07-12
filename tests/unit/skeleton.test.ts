/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  renderLinksSkeleton,
  renderToolbarSkeleton,
  setScreenBusy,
  SKELETON_CARD_COUNT,
} from "../../src/links/skeleton";

describe("renderLinksSkeleton", () => {
  it("renders the default number of skeleton cards", () => {
    const root = document.createElement("div");
    renderLinksSkeleton(root);
    expect(root.querySelectorAll(".links-skeleton__card")).toHaveLength(
      SKELETON_CARD_COUNT
    );
    expect(root.querySelector(".links-skeleton")?.getAttribute("aria-busy")).toBe(
      "true"
    );
  });

  it("respects a custom count", () => {
    const root = document.createElement("div");
    renderLinksSkeleton(root, 3);
    expect(root.querySelectorAll(".links-skeleton__card")).toHaveLength(3);
  });
});

describe("renderToolbarSkeleton", () => {
  it("renders icon placeholders in the toolbar slot", () => {
    const root = document.createElement("div");
    renderToolbarSkeleton(root);
    expect(root.querySelectorAll(".links-skeleton__icon")).toHaveLength(5);
    expect(
      root.querySelector(".links-skeleton--toolbar")?.getAttribute("aria-busy")
    ).toBe("true");
  });
});

describe("setScreenBusy", () => {
  it("adds and clears a shimmer overlay on a dialog", () => {
    const dialog = document.createElement("div");
    setScreenBusy(dialog, true);
    expect(dialog.querySelector(".links-skeleton-screen")).toBeTruthy();
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    setScreenBusy(dialog, false);
    expect(
      (dialog.querySelector(".links-skeleton-screen") as HTMLElement).hidden
    ).toBe(true);
    expect(dialog.hasAttribute("aria-busy")).toBe(false);
  });
});
