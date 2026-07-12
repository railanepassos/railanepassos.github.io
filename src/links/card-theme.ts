import type { Category } from "./category";

/** BEM modifier for category-themed list cards. */
export function categoryCardClass(category: Category): string {
  return `link-card--cat-${category}`;
}

/**
 * Prefer the experience photo; otherwise a local category stock image
 * (only categories with assets return a path).
 */
const STOCK: Partial<Record<Category, string>> = {
  trilha: "/assets/img/categories/trilha.jpg",
  museu: "/assets/img/categories/museu.jpg",
  praia: "/assets/img/categories/praia.jpg",
  restaurante: "/assets/img/categories/restaurante.jpg",
  bar: "/assets/img/categories/bar.jpg",
  cafeteria: "/assets/img/categories/cafeteria.jpg",
  praca: "/assets/img/categories/praca.jpg",
  parque: "/assets/img/categories/parque.jpg",
  evento: "/assets/img/categories/evento.jpg",
  "ponto-turistico": "/assets/img/categories/ponto-turistico.jpg",
  passeio: "/assets/img/categories/ponto-turistico.jpg",
  outro: "/assets/img/categories/outro.jpg",
};

export function categoryBackdropSrc(
  category: Category,
  imageUrl?: string | null
): string | null {
  if (imageUrl && /^https:\/\//i.test(imageUrl)) return imageUrl;
  return STOCK[category] ?? null;
}
