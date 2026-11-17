import { getSupabaseConfig, isSupabaseConfigured } from "./config";
import {
  SHARED_PLAN_INACTIVE,
  SHARED_PLAN_LOAD_ERROR,
  buildSharedPlanView,
  parsePlanFragment,
} from "./plan-share";
import { fetchSharedPlan } from "./shared-plan-api";
import { renderSharedPlan, renderSharedPlanMessage } from "./shared-plan-ui";

/**
 * Public, read-only view of a shared plan (Phase 4.1), opened by
 * /p/a8f3k2/#plano=<token>.
 *
 * It must stay free of auth: this module never imports auth.ts, session-storage.ts
 * or creates a supabase-js client, so nothing here reads or writes the auth
 * session in localStorage and no login UI is built. The only network call is
 * the public rpc (shared-plan-api.ts).
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
  const config = getSupabaseConfig();
  if (!isSupabaseConfigured(config)) {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
    return;
  }

  renderSharedPlanMessage(root, "Carregando o plano...");
  try {
    const view = buildSharedPlanView(await fetchSharedPlan(config, token));
    if (view === null) renderSharedPlanMessage(root, SHARED_PLAN_INACTIVE);
    else renderSharedPlan(root, view);
  } catch {
    renderSharedPlanMessage(root, SHARED_PLAN_LOAD_ERROR, "alert");
  }
}
