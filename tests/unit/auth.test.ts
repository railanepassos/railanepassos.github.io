import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../../src/links/auth";
import type { SupabaseClient, Session, AuthChangeEvent } from "@supabase/supabase-js";

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      ...overrides,
    },
  } as unknown as SupabaseClient;
}

describe("createAuth", () => {
  describe("signIn", () => {
    it("calls signInWithPassword with email and password", async () => {
      const client = makeFakeClient();
      const auth = createAuth(client);
      await auth.signIn("user@example.com", "password123");
      expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
      });
    });

    it("throws when supabase returns an error", async () => {
      const client = makeFakeClient({
        signInWithPassword: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Invalid credentials" },
        }),
      });
      const auth = createAuth(client);
      await expect(auth.signIn("bad@example.com", "wrong")).rejects.toThrow(
        "Invalid credentials"
      );
    });

    it("does not throw when sign-in succeeds", async () => {
      const client = makeFakeClient({
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "123" } } },
          error: null,
        }),
      });
      const auth = createAuth(client);
      await expect(auth.signIn("user@example.com", "password123")).resolves.not.toThrow();
    });
  });

  describe("signOut", () => {
    it("calls client.auth.signOut", async () => {
      const client = makeFakeClient();
      const auth = createAuth(client);
      await auth.signOut();
      expect(client.auth.signOut).toHaveBeenCalledOnce();
    });
  });

  describe("getSession", () => {
    it("returns null when no session", async () => {
      const client = makeFakeClient();
      const auth = createAuth(client);
      const session = await auth.getSession();
      expect(session).toBeNull();
    });

    it("returns the session object when present", async () => {
      const fakeSession = { user: { id: "abc" } } as unknown as Session;
      const client = makeFakeClient({
        getSession: vi.fn().mockResolvedValue({
          data: { session: fakeSession },
          error: null,
        }),
      });
      const auth = createAuth(client);
      const session = await auth.getSession();
      expect(session).toBe(fakeSession);
    });
  });

  describe("onAuthStateChange", () => {
    it("delegates to client.auth.onAuthStateChange and passes callback", () => {
      const client = makeFakeClient();
      const auth = createAuth(client);
      const callback = vi.fn();
      auth.onAuthStateChange(callback);
      expect(client.auth.onAuthStateChange).toHaveBeenCalledWith(callback);
    });

    it("returns the subscription returned by supabase", () => {
      const unsubscribe = vi.fn();
      const subscription = { unsubscribe };
      const client = makeFakeClient({
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription } }),
      });
      const auth = createAuth(client);
      const result = auth.onAuthStateChange(vi.fn());
      expect(result).toBe(subscription);
    });
  });
});
