export type DeckFlyDirection = "left" | "right" | "up";

export function prefersDeckMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function waitForMotion(
  el: HTMLElement,
  options: {
    className: string;
    timeoutMs?: number;
    event?: "animationend" | "transitionend";
    keepClass?: boolean;
  }
): Promise<void> {
  const eventName = options.event ?? "animationend";
  const timeoutMs = options.timeoutMs ?? 500;
  el.classList.add(options.className);

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener(eventName, onEnd);
      window.clearTimeout(timer);
      if (!options.keepClass) el.classList.remove(options.className);
      resolve();
    };
    const onEnd = (e: Event) => {
      if (e.target !== el) return;
      finish();
    };
    el.addEventListener(eventName, onEnd);
    const timer = window.setTimeout(finish, timeoutMs);
  });
}
