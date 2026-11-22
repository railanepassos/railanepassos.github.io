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

describe("createWakeLock overlapping acquires", () => {
  function deferredNav() {
    const resolvers: Array<(s: ReturnType<typeof fakeSentinel>) => void> = [];
    const nav = {
      wakeLock: {
        request: vi.fn().mockImplementation(
          () => new Promise((r) => resolvers.push(r as (s: ReturnType<typeof fakeSentinel>) => void))
        ),
      },
    };
    return { nav, resolvers };
  }

  it("releases the previous sentinel when a second acquire resolves", async () => {
    const { nav, resolvers } = deferredNav();
    const lock = createWakeLock(nav as unknown as Navigator, document);
    const first = lock.request();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    const s1 = fakeSentinel();
    const s2 = fakeSentinel();
    resolvers[0]!(s1);
    resolvers[1]!(s2);
    await first;
    await new Promise((r) => setTimeout(r, 0));
    expect(s1.release).toHaveBeenCalledTimes(1);
    await lock.release();
    expect(s2.release).toHaveBeenCalledTimes(1);
  });

  it("a late acquire resolving after release releases itself", async () => {
    const { nav, resolvers } = deferredNav();
    const lock = createWakeLock(nav as unknown as Navigator, document);
    const req = lock.request();
    await lock.release();
    const s = fakeSentinel();
    resolvers[0]!(s);
    await req;
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it("open/close/open quickly keeps exactly one live sentinel", async () => {
    const { nav, resolvers } = deferredNav();
    const lock = createWakeLock(nav as unknown as Navigator, document);
    const r1 = lock.request();
    await lock.release();
    const r2 = lock.request();
    const s1 = fakeSentinel();
    const s2 = fakeSentinel();
    resolvers[0]!(s1);
    resolvers[1]!(s2);
    await Promise.all([r1, r2]);
    expect(s1.release).toHaveBeenCalledTimes(1);
    expect(s2.release).not.toHaveBeenCalled();
    await lock.release();
    expect(s2.release).toHaveBeenCalledTimes(1);
  });
});
