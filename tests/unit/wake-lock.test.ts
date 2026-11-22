/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createWakeLock } from "../../src/links/wake-lock";

function fakeSentinel() {
  return { release: vi.fn().mockResolvedValue(undefined) };
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
}

describe("createWakeLock", () => {
  it("does not throw when navigator.wakeLock is missing", async () => {
    const lock = createWakeLock({} as Navigator, document);
    await expect(lock.request()).resolves.toBeUndefined();
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it("does not throw when request rejects", async () => {
    const nav = { wakeLock: { request: vi.fn().mockRejectedValue(new Error("denied")) } };
    const lock = createWakeLock(nav as unknown as Navigator, document);
    await expect(lock.request()).resolves.toBeUndefined();
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it("requests a screen lock and releases the sentinel", async () => {
    const sentinel = fakeSentinel();
    const nav = { wakeLock: { request: vi.fn().mockResolvedValue(sentinel) } };
    const lock = createWakeLock(nav as unknown as Navigator, document);
    await lock.request();
    expect(nav.wakeLock.request).toHaveBeenCalledWith("screen");
    await lock.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("re-acquires when the document becomes visible again", async () => {
    const nav = { wakeLock: { request: vi.fn().mockImplementation(async () => fakeSentinel()) } };
    const lock = createWakeLock(nav as unknown as Navigator, document);
    await lock.request();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2);
    await lock.release();
  });

  it("stops re-acquiring after release", async () => {
    const nav = { wakeLock: { request: vi.fn().mockImplementation(async () => fakeSentinel()) } };
    const lock = createWakeLock(nav as unknown as Navigator, document);
    await lock.request();
    await lock.release();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it("does not stack listeners on repeated request calls", async () => {
    const nav = { wakeLock: { request: vi.fn().mockImplementation(async () => fakeSentinel()) } };
    const lock = createWakeLock(nav as unknown as Navigator, document);
    await lock.request();
    await lock.request();
    nav.wakeLock.request.mockClear();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
    await lock.release();
  });
});
