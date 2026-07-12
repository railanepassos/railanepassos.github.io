/** Closed set of experience categories (stored in DB). */
export const CATEGORY_OPTIONS = [
  "museu",
  "evento",
  "restaurante",
  "trilha",
  "praca",
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
  trilha: "Trilha",
  praca: "Praça",
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
    re: /\b(restaurante|cafe|bar|lanchonete|padaria|bistro)\b/,
    category: "restaurante",
  },
  {
    re: /\b(trilha|trekking|hiking|caminhada)\b/,
    category: "trilha",
  },
  { re: /\bpraca\b/, category: "praca" },
  { re: /\b(praia|beach)\b/, category: "praia" },
  {
    re: /\b(parque|mirante|monumento|castelo|catedral|turismo|turistico|atrativo)\b/,
    category: "ponto-turistico",
  },
  { re: /\bpasseio\b/, category: "passeio" },
];

export type CategoryFields = {
  label: string;
  description?: string | null;
  url?: string | null;
  category?: string | null;
};

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

export function categoryLabel(category: string): string {
  return isCategory(category) ? LABELS[category] : LABELS.outro;
}

/** Empty array = Todas (no filter). Match if resolveCategory is in the set. */
export function filterLinksByCategory<T extends CategoryFields>(
  links: T[],
  selected: readonly Category[]
): T[] {
  if (selected.length === 0) return links;
  const allowed = new Set(selected);
  return links.filter((link) => allowed.has(resolveCategory(link)));
}

function isCategory(value: string): value is Category {
  return (CATEGORY_OPTIONS as readonly string[]).includes(value);
}
