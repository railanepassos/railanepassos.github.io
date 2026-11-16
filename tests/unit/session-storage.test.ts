/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthStorage, getRememberMe, setRememberMe } from "../../src/links/session-storage";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("getRememberMe / setRememberMe", () => {
  it("defaults to true when no preference was ever stored", () => {
    expect(getRememberMe()).toBe(true);
  });

  it("returns false after setRememberMe(false)", () => {
    setRememberMe(false);
    expect(getRememberMe()).toBe(false);
  });

  it("returns true after setRememberMe(true)", () => {
    setRememberMe(false);
    setRememberMe(true);
    expect(getRememberMe()).toBe(true);
  });
});

describe("createAuthStorage", () => {
  it("writes to localStorage when remembered", () => {
    setRememberMe(true);
    const storage = createAuthStorage();
    storage.setItem("sb-session", "token-a");
    expect(localStorage.getItem("sb-session")).toBe("token-a");
    expect(sessionStorage.getItem("sb-session")).toBeNull();
    expect(storage.getItem("sb-session")).toBe("token-a");
  });

  it("writes to sessionStorage when not remembered", () => {
    setRememberMe(false);
    const storage = createAuthStorage();
    storage.setItem("sb-session", "token-b");
    expect(sessionStorage.getItem("sb-session")).toBe("token-b");
    expect(localStorage.getItem("sb-session")).toBeNull();
    expect(storage.getItem("sb-session")).toBe("token-b");
  });

  it("scrubs the other backend so a stale token can't resurface", () => {
    setRememberMe(true);
    let storage = createAuthStorage();
    storage.setItem("sb-session", "old-remembered-token");

    setRememberMe(false);
    storage = createAuthStorage();
    storage.setItem("sb-session", "new-session-only-token");

    expect(localStorage.getItem("sb-session")).toBeNull();
    expect(sessionStorage.getItem("sb-session")).toBe("new-session-only-token");
  });

  it("removeItem clears both backends regardless of the current preference", () => {
    localStorage.setItem("sb-session", "a");
    sessionStorage.setItem("sb-session", "b");
    const storage = createAuthStorage();
    storage.removeItem("sb-session");
    expect(localStorage.getItem("sb-session")).toBeNull();
    expect(sessionStorage.getItem("sb-session")).toBeNull();
  });
});
