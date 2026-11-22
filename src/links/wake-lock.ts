/**
 * Screen Wake Lock for visit mode. Never throws: when the API is missing or
 * the request is refused, the screen just may dim. While requested, the lock
 * is re-acquired when the page becomes visible again (browsers drop it when
 * the tab is hidden).
 */

type Sentinel = { release(): Promise<void> };

export type WakeLock = {
  request(): Promise<void>;
  release(): Promise<void>;
};

export function createWakeLock(
  nav: Navigator = navigator,
  doc: Document = document
): WakeLock {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let listening = false;

  async function acquire(): Promise<void> {
    const api = (nav as { wakeLock?: { request(type: "screen"): Promise<Sentinel> } }).wakeLock;
    if (!api) return;
    try {
      const next = await api.request("screen");
      if (wanted) {
        const previous = sentinel;
        sentinel = next;
        // Overlapping acquires: never leave an earlier sentinel unreleased.
        if (previous && previous !== next) await previous.release().catch(() => undefined);
      } else {
        await next.release().catch(() => undefined);
      }
    } catch {
      /* refused or unsupported: keep whatever sentinel we already hold */
    }
  }

  const onVisibility = (): void => {
    if (wanted && doc.visibilityState === "visible") void acquire();
  };

  return {
    async request() {
      wanted = true;
      if (!listening) {
        doc.addEventListener("visibilitychange", onVisibility);
        listening = true;
      }
      await acquire();
    },
    async release() {
      wanted = false;
      if (listening) {
        doc.removeEventListener("visibilitychange", onVisibility);
        listening = false;
      }
      const current = sentinel;
      sentinel = null;
      try {
        await current?.release();
      } catch {
        /* already released by the browser */
      }
    },
  };
}
