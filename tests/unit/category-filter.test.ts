import { describe, expect, it } from "vitest";
import { filterLinksByCategory } from "../../src/links/category";
import type { LinkRow } from "../../src/links/links-repo";

function row(
  partial: Partial<LinkRow> & Pick<LinkRow, "id" | "label">
): LinkRow {
  return {
    url: "https://example.com",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: null,
    sort_order: 0,
    ...partial,
  };
}

describe("filterLinksByCategory", () => {
  const links = [
    row({ id: "1", label: "Museu do Mar", category: "museu" }),
    row({ id: "2", label: "Trilha da serra", category: "trilha" }),
    row({ id: "3", label: "Show", category: "evento" }),
    row({ id: "4", label: "Jantar", category: "restaurante" }),
  ];

  it("returns all when selected list is empty (Todas)", () => {
    expect(filterLinksByCategory(links, [])).toEqual(links);
  });

  it("keeps a single matching category", () => {
    expect(filterLinksByCategory(links, ["museu"]).map((l) => l.id)).toEqual([
      "1",
    ]);
  });

  it("keeps any of several selected categories", () => {
    expect(
      filterLinksByCategory(links, ["museu", "evento", "restaurante"]).map(
        (l) => l.id
      )
    ).toEqual(["1", "3", "4"]);
  });

  it("excludes categories not in the selection", () => {
    expect(
      filterLinksByCategory(links, ["museu", "evento"]).map((l) => l.id)
    ).toEqual(["1", "3"]);
  });

  it("infers category when stored value is null", () => {
    const inferred = [
      row({ id: "a", label: "Museu X", category: null }),
      row({ id: "b", label: "Praia Y", category: null }),
    ];
    expect(
      filterLinksByCategory(inferred, ["museu", "praia"]).map((l) => l.id)
    ).toEqual(["a", "b"]);
  });
});
