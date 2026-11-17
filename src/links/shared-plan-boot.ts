import { planProgress } from "./plan";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";
import {
  SHARED_PLAN_INACTIVE,
  SHARED_PLAN_LOAD_ERROR,
  buildSharedPlanView,
  parsePlanFragment,
  planWriteErrorMessage,
  type PlanWriteError,
  type SharedPlanView,
} from "./plan-share";
import { SharedPlanWriteFailure, fetchSharedPlan, setSharedPlanDone, setSharedPlanWho } from "./shared-plan-api";
import { renderSharedPlan, renderSharedPlanMessage } from "./shared-plan-ui";

/**
 * Public, read-only view of a shared plan (Phase 4.1), opened by
 * /p/a8f3k2/#plano=<token>.
 *
 * It must stay free of auth: this module never imports auth.ts, session-storage.ts
 * or creates a supabase-js client, so nothing here reads or writes the auth
 * session in localStorage and no login UI is built. The only network calls are
 * the public rpcs (shared-plan-api.ts): read, tick one item, claim one item.
 */
export async function bootSharedPlan(hash: string): Promise<void> {
  const main = document.querySelector<HTMLElement>(".links-app__main");
  if (!main) return;

  document.title = "Plano do passeio";
  const title = document.querySelector<HTMLElement>(".links-appbar__title");
  if (title) title.textContent = "Plano do passeio";
  // Not the editor shell: no toolbar, nav, chips, tab bar, feed.
  document.getElementById("links-admin-root")?.replaceChildren();
  for (const id of ["links-sidenav", "links-chips", "links-heading", "links-tabbar", "links-list"]) {
    const node = document.getElementById(id);
    if (node) node.hidden = true;
  }
  const root = document.createElement("div");
  root.id = "shared-plan-root";
  main.appendChild(root);

  const token = parsePlanFragment(hash);
  if (token === null) {
    renderSharedPlanMessage(root, SHARED_PLAN_INACTIVE);
    return;
  }
  await runSharedPlan(root, token);
}

/** Loads the plan for a valid token and wires ticks, claims and refreshes. */
async function runSharedPlan(root: HTMLElement, token: string): Promise<void> {
  const config = getSupabaseConfig();
  if (!isSupabaseConfigured(config)) {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
    return;
  }

  renderSharedPlanMessage(root, "Carregando o plano...");

  let view: SharedPlanView | null = null;
  let notice: string | null = null;
  // Writes run one at a time, in order. A failure bumps `epoch` so writes still
  // queued behind it are dropped (they were made on a plan we are reloading).
  let queue: Promise<void> = Promise.resolve();
  let epoch = 0;
  let inFlight = 0;

  const show = (): void => {
    if (view) renderSharedPlan(root, view, onToggle, onClaim, notice);
  };

  const load = async (): Promise<void> => {
    const next = buildSharedPlanView(await fetchSharedPlan(config, token));
    if (next === null) {
      view = null;
      renderSharedPlanMessage(root, SHARED_PLAN_INACTIVE);
    } else {
      view = next;
      show();
    }
  };

  const recover = async (kind: PlanWriteError): Promise<void> => {
    epoch += 1;
    if (kind === "inactive") {
      view = null;
      renderSharedPlanMessage(root, planWriteErrorMessage("inactive"));
      return;
    }
    notice = planWriteErrorMessage(kind);
    try {
      await load();
    } catch {
      renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
    }
  };

  /**
   * Runs one write behind the previous ones. Every answer is the whole plan, so
   * only the last one in flight is shown; earlier answers would undo queued writes.
   */
  function enqueue(write: () => Promise<unknown>): void {
    const myEpoch = epoch;
    inFlight += 1;
    queue = queue.then(async () => {
      try {
        if (myEpoch !== epoch) return;
        const plan = await write();
        if (inFlight === 1 && myEpoch === epoch) {
          const next = buildSharedPlanView(plan);
          if (next) {
            view = next;
            show();
          }
        }
      } catch (error) {
        if (myEpoch !== epoch) return;
        await recover(error instanceof SharedPlanWriteFailure ? error.kind : "error");
      } finally {
        inFlight -= 1;
      }
    });
  }

  /** Applies a change to the shown plan right away, then queues the matching write. */
  function change(
    apply: (item: { idx: number; done: boolean; who: string | null }) => void,
    idx: number,
    write: () => Promise<unknown>
  ): void {
    if (!view) return;
    notice = null;
    for (const list of view.lists) {
      for (const item of list.items) if (item.idx === idx) apply(item);
      // Optimistic: progress labels follow the new state.
      const items = list.items.map((i) => ({ text: i.text, list: list.key, done: i.done }));
      list.progress = planProgress(items, list.key).label;
    }
    show();
    enqueue(write);
  }

  function onToggle(idx: number, text: string, done: boolean): void {
    change(
      (item) => {
        item.done = done;
      },
      idx,
      () => setSharedPlanDone(config, { token, idx, expectedText: text, done })
    );
  }

  function onClaim(idx: number, text: string, who: string | null): void {
    change(
      (item) => {
        item.who = who;
      },
      idx,
      () => setSharedPlanWho(config, { token, idx, expectedText: text, who })
    );
  }

  /**
   * Story 13: coming back to the page (tab visible again, or restored from the
   * back/forward cache) shows what the others ticked meanwhile. Silent on network
   * errors, and skipped while own writes are pending (their answer will refresh).
   */
  async function refresh(): Promise<void> {
    if (inFlight > 0) return;
    const myEpoch = epoch;
    try {
      const next = buildSharedPlanView(await fetchSharedPlan(config, token));
      if (inFlight > 0 || myEpoch !== epoch) return;
      if (next === null) {
        view = null;
        renderSharedPlanMessage(root, SHARED_PLAN_INACTIVE);
      } else {
        view = next;
        show();
      }
    } catch {
      // keep what is on screen
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refresh();
  });

  try {
    await load();
  } catch {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
  }
}
