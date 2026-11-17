/** Closed set of experience categories (stored in DB). */
export const CATEGORY_OPTIONS = [
  "museu",
  "evento",
  "restaurante",
  "bar",
  "cafeteria",
  "trilha",
  "praca",
  "parque",
  "praia",
  "ponto-turistico",
  "passeio",
  "outro",
] as const;

export type Category = (typeof CATEGORY_OPTIONS)[number];

const LABELS: Record<Category, string> = {
  museu: "Museu",
  evento: "Evento",
  restaurante: "Restaurante",
  bar: "Barzinho",
  cafeteria: "Cafeteria",
  trilha: "Trilha",
  praca: "Praça",
  parque: "Parque",
  praia: "Praia",
  "ponto-turistico": "Ponto turístico",
  passeio: "Passeio",
  outro: "Outro",
};

/** First match wins — more specific keywords before generic ones. */
const RULES: Array<{ re: RegExp; category: Category }> = [
  { re: /\bmuseu\b/, category: "museu" },
  {
    re: /\b(show|festival|evento|concerto|teatro|peca)\b/,
    category: "evento",
  },
  {
    re: /\b(barzinho|boteco|bar|pub|cervejaria|choperia)\b/,
    category: "bar",
  },
  {
    re: /\b(cafeteria|cafe|coffee|cafelier)\b/,
    category: "cafeteria",
  },
  {
    re: /\b(restaurante|lanchonete|padaria|bistro)\b/,
    category: "restaurante",
  },
  {
    re: /\b(trilha|trekking|hiking|caminhada)\b/,
    category: "trilha",
  },
  { re: /\bpraca\b/, category: "praca" },
  { re: /\bparque\b/, category: "parque" },
  { re: /\b(praia|beach)\b/, category: "praia" },
  {
    re: /\b(mirante|monumento|castelo|catedral|turismo|turistico|atrativo)\b/,
    category: "ponto-turistico",
  },
  { re: /\bpasseio\b/, category: "passeio" },
];

export type CategoryFields = {
  label: string;
  description?: string | null;
  url?: string | null;
  category?: string | null;
  /** Extra categories (discovery only). Cards, deck and theme use the main one. */
  extra_categories?: readonly string[] | null;
};

/** Main category plus up to 3 extras. */
export const MAX_CATEGORIES = 4;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Infer category from title, note, and URL via keyword regex.
 * Accent-insensitive; defaults to `outro`.
 */
export function inferCategory(fields: {
  label: string;
  description?: string | null;
  url?: string | null;
}): Category {
  const haystack = normalize(
    [fields.label, fields.description ?? "", fields.url ?? ""].join(" ")
  );

  for (const rule of RULES) {
    if (rule.re.test(haystack)) return rule.category;
  }
  return "outro";
}

/** Prefer stored DB value; otherwise infer from text fields. */
export function resolveCategory(fields: CategoryFields): Category {
  if (fields.category && isCategory(fields.category)) {
    return fields.category;
  }
  return inferCategory(fields);
}

/**
 * Every category of an item: the resolved main first, then the valid, unique
 * extras in stored order (capped at MAX_CATEGORIES in total).
 */
export function allCategories(fields: CategoryFields): Category[] {
  const main = resolveCategory(fields);
  return [main, ...normalizeExtraCategories(fields.extra_categories, main)];
}

export function categoryLabel(category: string): string {
  return isCategory(category) ? LABELS[category] : LABELS.outro;
}

/** Empty array = Todas (no filter). Match if any of the item's categories is in the set. */
export function filterLinksByCategory<T extends CategoryFields>(
  links: T[],
  selected: readonly Category[]
): T[] {
  if (selected.length === 0) return links;
  const allowed = new Set(selected);
  return links.filter((link) => allCategories(link).some((c) => allowed.has(c)));
}

export function isCategory(value: string): value is Category {
  return (CATEGORY_OPTIONS as readonly string[]).includes(value);
}

/**
 * Form chips (ordered): the first picked is the main category. "" = Automática
 * and clears everything. Ticking beyond MAX_CATEGORIES or an unknown value is
 * ignored; unticking the main promotes the next one.
 */
export function togglePickedCategory(picked: readonly string[], value: string): string[] {
  if (value === "") return [];
  if (!isCategory(value)) return [...picked];
  if (picked.includes(value)) return picked.filter((c) => c !== value);
  if (picked.length >= MAX_CATEGORIES) return [...picked];
  return [...picked, value];
}

/** Clean extras for a given main: valid, unique, not the main, at most MAX_CATEGORIES - 1. */
export function normalizeExtraCategories(
  extras: readonly string[] | null | undefined,
  main: string | null | undefined
): Category[] {
  const out: Category[] = [];
  for (const e of extras ?? []) {
    if (out.length >= MAX_CATEGORIES - 1) break;
    if (isCategory(e) && e !== main && !out.includes(e)) out.push(e);
  }
  return out;
}
