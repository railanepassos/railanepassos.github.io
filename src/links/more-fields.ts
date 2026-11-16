import type { IconName } from "./ui-icons";

/**
 * Registry of the optional free-text "Mais detalhes" fields (Phase 2).
 *
 * One entry drives everything that is the same for every plain-text field:
 * the form input (collapsed "Mais detalhes" section), the repo length check,
 * the form -> payload mapping and the row in the detail view (hidden when
 * empty). To add another text field (dossier, itinerary, ...): add the column
 * in the migration, add the key to `LinkRow`/`CreateLinkInput`/
 * `UpdateLinkPatch`/`LinkFormValues`, and append ONE entry here.
 */

export type MoreTextKey = "cost_text" | "city" | "address" | "dossier" | "itinerary";

export type MoreTextField = {
  key: MoreTextKey;
  /** Label of the form control. */
  formLabel: string;
  /** Short term shown in the detail view and used in error messages. */
  term: string;
  /** Max characters (mirrors the DB check constraint). */
  max: number;
  icon: IconName;
  placeholder?: string;
  /** Multi-line (textarea) instead of a single-line input. */
  multiline?: boolean;
};

export const MORE_TEXT_FIELDS: readonly MoreTextField[] = [
  {
    key: "cost_text",
    formLabel: "Custo (opcional)",
    term: "Custo",
    max: 200,
    icon: "tag",
    placeholder: "Ex.: R$ 20 inteira · grátis às quartas",
  },
  { key: "city", formLabel: "Cidade (opcional)", term: "Cidade", max: 120, icon: "pin" },
  {
    key: "address",
    formLabel: "Endereço (opcional)",
    term: "Endereço",
    max: 300,
    icon: "pin",
  },
  {
    key: "dossier",
    formLabel: "Dossiê (opcional)",
    term: "Dossiê",
    max: 5000,
    icon: "note",
    placeholder: "História, curiosidades, o que não perder",
    multiline: true,
  },
  {
    key: "itinerary",
    formLabel: "Roteiro (opcional)",
    term: "Roteiro",
    max: 5000,
    icon: "clock",
    placeholder: "Ordem das paradas, horários, dicas",
    multiline: true,
  },
];

/** Maps each registered text key to a trimmed string value. */
export type MoreTextValues = Record<MoreTextKey, string>;

export function emptyMoreTextValues(): MoreTextValues {
  return { cost_text: "", city: "", address: "", dossier: "", itinerary: "" };
}
