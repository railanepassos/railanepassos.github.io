import { categoryLabel, type Category } from "./category";
import type { CategoryCount, Section } from "./feed";
import { uiIcon, type IconName } from "./ui-icons";

/**
 * App chrome for the authenticated links page: app-bar actions (search,
 * draw, add, sign out), category chips (mobile), side navigation (desktop)
 * and the bottom tab bar (mobile). Pure DOM, no innerHTML, CSP-safe.
 */

export type ShellState = {
  section: Section;
  categories: readonly Category[];
  sectionCounts: Record<Section, number>;
  categoryCounts: readonly CategoryCount[];
};

export type ShellHandlers = {
  onSection: (section: Section) => void;
  onToggleCategory: (category: Category) => void;
  onClearCategories: () => void;
  onQuery: (query: string) => void;
  onAdd: () => void;
  onDeck: () => void;
  onDraw: () => void;
  onSignOut: () => void;
};

export const SECTION_TITLES: Record<Section, string> = {
  feed: "Quero conhecer",
  agenda: "Agenda",
  done: "Feitos",
  memories: "Memórias",
};

function iconButton(icon: IconName, label: string, className: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.appendChild(uiIcon(icon, 22));
  return btn;
}

function labelledButton(icon: IconName, text: string, className: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  const span = document.createElement("span");
  span.textContent = text;
  btn.append(uiIcon(icon, 18), span);
  return btn;
}

/**
 * App-bar actions. The search input is a single element: always visible on
 * desktop; on mobile a search icon expands it over the title.
 */
export function createAppBarActions(
  handlers: Pick<ShellHandlers, "onQuery" | "onAdd" | "onDraw" | "onSignOut">,
  appBar: HTMLElement | null
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "links-appbar__tools";

  const search = document.createElement("div");
  search.className = "links-search";
  search.setAttribute("role", "search");

  const searchIcon = uiIcon("search", 18);
  searchIcon.classList.add("links-search__icon");

  const input = document.createElement("input");
  input.type = "search";
  input.id = "links-search-input";
  input.className = "links-search__input";
  input.placeholder = "Buscar: lugar, #tag, @pessoa, cidade:, custo<";
  input.setAttribute("aria-label", "Buscar experiências");
  input.autocomplete = "off";
  input.setAttribute("enterkeyhint", "search");

  const closeSearch = iconButton("close", "Fechar busca", "links-icon-btn links-search__close");

  search.append(searchIcon, input, closeSearch);

  const openSearch = iconButton("search", "Buscar", "links-icon-btn links-appbar__search-toggle");
  openSearch.setAttribute("aria-controls", "links-search-input");
  openSearch.setAttribute("aria-expanded", "false");

  function setSearching(on: boolean): void {
    appBar?.classList.toggle("links-appbar--searching", on);
    openSearch.setAttribute("aria-expanded", on ? "true" : "false");
  }

  openSearch.addEventListener("click", () => {
    setSearching(true);
    input.focus();
  });
  closeSearch.addEventListener("click", () => {
    input.value = "";
    handlers.onQuery("");
    setSearching(false);
    openSearch.focus();
  });
  input.addEventListener("input", () => handlers.onQuery(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeSearch.click();
    }
  });

  const draw = iconButton("shuffle", "Sortear experiência", "links-icon-btn links-appbar__draw");
  draw.addEventListener("click", handlers.onDraw);

  const add = labelledButton("plus", "Nova experiência", "links-appbar__add");
  add.addEventListener("click", handlers.onAdd);

  const signOut = iconButton("logout", "Sair", "links-icon-btn");
  signOut.addEventListener("click", handlers.onSignOut);

  wrap.append(search, openSearch, draw, add, signOut);
  return wrap;
}

/** Horizontal, scrollable category chips (mobile primary filter). */
export function renderChips(
  container: HTMLElement,
  state: ShellState,
  handlers: Pick<ShellHandlers, "onToggleCategory" | "onClearCategories">
): void {
  const scrollLeft = container.firstElementChild?.scrollLeft ?? 0;
  container.replaceChildren();
  const row = document.createElement("div");
  row.className = "links-chips";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Filtrar por categoria");

  const all = document.createElement("button");
  all.type = "button";
  all.className = "links-chip";
  all.textContent = "Todos";
  all.dataset.category = "";
  const allOn = state.categories.length === 0;
  all.setAttribute("aria-pressed", allOn ? "true" : "false");
  all.classList.toggle("links-chip--active", allOn);
  all.addEventListener("click", handlers.onClearCategories);
  row.appendChild(all);

  for (const { category, count } of chipEntries(state)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "links-chip";
    chip.dataset.category = category;
    const on = state.categories.includes(category);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.classList.toggle("links-chip--active", on);
    const text = document.createElement("span");
    text.textContent = categoryLabel(category);
    const num = document.createElement("span");
    num.className = "links-chip__count";
    num.textContent = String(count);
    chip.append(text, num);
    chip.addEventListener("click", () => handlers.onToggleCategory(category));
    row.appendChild(chip);
  }
  container.appendChild(row);
  row.scrollLeft = scrollLeft;
}

/** Categories with items in the current section, plus any still selected. */
function chipEntries(state: ShellState): CategoryCount[] {
  const entries = [...state.categoryCounts];
  for (const c of state.categories) {
    if (!entries.some((e) => e.category === c)) entries.push({ category: c, count: 0 });
  }
  return entries;
}

function sectionButton(
  section: Section,
  icon: IconName,
  state: ShellState,
  onSection: (s: Section) => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-sidenav__item";
  btn.dataset.section = section;
  if (state.section === section) {
    btn.classList.add("links-sidenav__item--active");
    btn.setAttribute("aria-current", "page");
  }
  const label = document.createElement("span");
  label.className = "links-sidenav__label";
  label.textContent = SECTION_TITLES[section];
  const count = document.createElement("span");
  count.className = "links-sidenav__count";
  count.textContent = String(state.sectionCounts[section]);
  btn.append(uiIcon(icon, 20), label, count);
  btn.addEventListener("click", () => onSection(section));
  return btn;
}

/** Desktop left navigation: sections, Deck / Sortear, categories with counts. */
export function renderSideNav(
  container: HTMLElement,
  state: ShellState,
  handlers: ShellHandlers
): void {
  container.replaceChildren();

  const sections = document.createElement("div");
  sections.className = "links-sidenav__group";
  sections.append(
    sectionButton("feed", "home", state, handlers.onSection),
    sectionButton("agenda", "calendar", state, handlers.onSection),
    sectionButton("done", "check", state, handlers.onSection),
    sectionButton("memories", "clock", state, handlers.onSection)
  );

  const deck = document.createElement("button");
  deck.type = "button";
  deck.className = "links-sidenav__item";
  deck.dataset.action = "deck";
  const deckLabel = document.createElement("span");
  deckLabel.className = "links-sidenav__label";
  deckLabel.textContent = "Deck";
  deck.append(uiIcon("deck", 20), deckLabel);
  deck.addEventListener("click", handlers.onDeck);
  sections.appendChild(deck);

  const heading = document.createElement("h2");
  heading.className = "links-sidenav__heading";
  heading.id = "links-sidenav-categories";
  heading.textContent = "Categorias";

  const cats = document.createElement("div");
  cats.className = "links-sidenav__group";
  cats.setAttribute("role", "group");
  cats.setAttribute("aria-labelledby", "links-sidenav-categories");

  const all = document.createElement("button");
  all.type = "button";
  all.className = "links-sidenav__cat";
  const allOn = state.categories.length === 0;
  all.setAttribute("aria-pressed", allOn ? "true" : "false");
  all.classList.toggle("links-sidenav__cat--active", allOn);
  const allLabel = document.createElement("span");
  allLabel.className = "links-sidenav__label";
  allLabel.textContent = "Todas";
  all.appendChild(allLabel);
  all.addEventListener("click", handlers.onClearCategories);
  cats.appendChild(all);

  for (const { category, count } of chipEntries(state)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "links-sidenav__cat";
    btn.dataset.category = category;
    const on = state.categories.includes(category);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("links-sidenav__cat--active", on);
    const label = document.createElement("span");
    label.className = "links-sidenav__label";
    label.textContent = categoryLabel(category);
    const num = document.createElement("span");
    num.className = "links-sidenav__count";
    num.textContent = String(count);
    btn.append(label, num);
    btn.addEventListener("click", () => handlers.onToggleCategory(category));
    cats.appendChild(btn);
  }

  container.append(sections, heading, cats);
}

/** Mobile bottom tab bar: Feed, Deck, centered add, Agenda, Feitos. */
export function renderTabBar(
  container: HTMLElement,
  state: ShellState,
  handlers: Pick<ShellHandlers, "onSection" | "onAdd" | "onDeck">
): void {
  container.replaceChildren();

  /** The Memórias view lives under the Feitos tab (mobile switch), so it keeps that tab active. */
  const activeTab: Section = state.section === "memories" ? "done" : state.section;

  function tab(icon: IconName, text: string, onClick: () => void, section?: Section): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "links-tabbar__tab";
    if (section) {
      btn.dataset.section = section;
      if (activeTab === section) {
        btn.classList.add("links-tabbar__tab--active");
        btn.setAttribute("aria-current", "page");
      }
    }
    const label = document.createElement("span");
    label.textContent = text;
    btn.append(uiIcon(icon, 24), label);
    btn.addEventListener("click", onClick);
    return btn;
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "links-tabbar__add";
  add.setAttribute("aria-label", "Nova experiência");
  add.title = "Nova experiência";
  add.appendChild(uiIcon("plus", 26));
  add.addEventListener("click", handlers.onAdd);
  const addCell = document.createElement("div");
  addCell.className = "links-tabbar__add-cell";
  addCell.appendChild(add);

  container.append(
    tab("home", "Feed", () => handlers.onSection("feed"), "feed"),
    tab("deck", "Deck", handlers.onDeck),
    addCell,
    tab("calendar", "Agenda", () => handlers.onSection("agenda"), "agenda"),
    tab("check", "Feitos", () => handlers.onSection("done"), "done")
  );
}
