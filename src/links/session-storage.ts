import type { SupportedStorage } from "@supabase/supabase-js";

const REMEMBER_ME_KEY = "links-remember-me";

/** Defaults to true so first-time visitors get supabase-js' own default (persistent). */
export function getRememberMe(): boolean {
  return localStorage.getItem(REMEMBER_ME_KEY) !== "0";
}

/** Call before signIn(): decides where the upcoming session gets written. */
export function setRememberMe(remember: boolean): void {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
}

/**
 * Storage adapter for supabase-js: "remember me" on writes the session to
 * localStorage (survives closing the browser); off writes to sessionStorage
 * (cleared when the tab closes). Each write also scrubs the other backend so
 * a stale token from an earlier choice can't resurface later.
 */
export function createAuthStorage(): SupportedStorage {
  function backend(): Storage {
    return getRememberMe() ? localStorage : sessionStorage;
  }

  return {
    getItem(key: string) {
      return backend().getItem(key);
    },
    setItem(key: string, value: string) {
      const active = backend();
      active.setItem(key, value);
      const other = active === localStorage ? sessionStorage : localStorage;
      other.removeItem(key);
    },
    removeItem(key: string) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    },
  };
}
