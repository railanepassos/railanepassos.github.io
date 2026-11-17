import { getSupabaseConfig, isSupabaseConfigured } from "./config";
import {
  SHARED_PLAN_INACTIVE,
  SHARED_PLAN_LOAD_ERROR,
  buildSharedPlanView,
  parsePlanFragment,
  planWriteErrorMessage,
  type SharedPlanView,
} from "./plan-share";
import { SharedPlanWriteFailure, fetchSharedPlan, setSharedPlanDone } from "./shared-plan-api";
import { renderSharedPlan, renderSharedPlanMessage } from "./shared-plan-ui";

/**
 * Public, read-only view of a shared plan (Phase 4.1), opened by
 * /p/a8f3k2/#plano=<token>.
 *
 * It must stay free of auth: this module never imports auth.ts, session-storage.ts
 * or creates a supabase-js client, so nothing here reads or writes the auth
 * session in localStorage and no login UI is built. The only network calls are
 * the two public rpcs (shared-plan-api.ts): read, and tick one item.
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
  const planToken: string = token;
  const config = getSupabaseConfig();
  if (!isSupabaseConfigured(config)) {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
    return;
  }

  renderSharedPlanMessage(root, "Carregando o plano...");

  let view: SharedPlanView | null = null;
  let notice: string | null = null;
  // Ticks run one at a time, in order. A failure bumps `epoch` so ticks still
  // queued behind it are dropped (they were made on a plan we are reloading).
  let queue: Promise<void> = Promise.resolve();
  let epoch = 0;
  let inFlight = 0;

  const show = (): void => {
    if (view) renderSharedPlan(root, view, onToggle, notice);
  };

  const load = async (): Promise<void> => {
    const next = buildSharedPlanView(await fetchSharedPlan(config, planToken));
    if (next === null) {
      view = null;
      renderSharedPlanMessage(root, SHARED_PLAN_INACTIVE);
    } else {
      view = next;
      show();
    }
  };

  const recover = async (kind: "inactive" | "conflict" | "error"): Promise<void> => {
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

  function onToggle(idx: number, text: string, done: boolean): void {
    if (!view) return;
    notice = null;
    for (const list of view.lists) {
      for (const item of list.items) if (item.idx === idx) item.done = done;
    }
    // Optimistic: progress labels follow the new state.
    for (const list of view.lists) {
      const doneCount = list.items.filter((i) => i.done).length;
      list.progress = `${doneCount} de ${list.items.length}`;
    }
    show();

    const myEpoch = epoch;
    inFlight += 1;
    queue = queue.then(async () => {
      try {
        if (myEpoch !== epoch) return;
        const plan = await setSharedPlanDone(config, { token: planToken, idx, expectedText: text, done });
        // Only the last answer wins: earlier ones would undo queued ticks.
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

  try {
    await load();
  } catch {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
  }
}
