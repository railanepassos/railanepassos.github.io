import { describe, expect, it } from "vitest";
import { allCategories, filterLinksByCategory, MAX_CATEGORIES, togglePickedCategory } from "../../src/links/category";
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
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
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

describe("allCategories", () => {
  it("returns the resolved main first, then the extras in order", () => {
    const link = row({
      id: "m",
      label: "Vila do Caranguejo",
      category: "restaurante",
      extra_categories: ["praia", "passeio"],
    });
    expect(allCategories(link)).toEqual(["restaurante", "praia", "passeio"]);
  });

  it("uses the inferred main when category is null", () => {
    const link = row({ id: "i", label: "Praia Y", category: null, extra_categories: ["bar"] });
    expect(allCategories(link)).toEqual(["praia", "bar"]);
  });

  it("is just the main when there are no extras (missing or empty)", () => {
    expect(allCategories(row({ id: "s", label: "Museu", category: "museu" }))).toEqual(["museu"]);
    expect(
      allCategories(row({ id: "e", label: "Museu", category: "museu", extra_categories: [] }))
    ).toEqual(["museu"]);
  });

  it("drops unknown, duplicate and main-equal extras and caps at the limit", () => {
    const link = row({
      id: "d",
      label: "X",
      category: "bar",
      extra_categories: ["bar", "churrascaria", "praia", "praia", "passeio", "museu", "evento"],
    });
    expect(allCategories(link)).toEqual(["bar", "praia", "passeio", "museu"]);
    expect(allCategories(link)).toHaveLength(MAX_CATEGORIES);
  });
});

describe("filterLinksByCategory with extra categories", () => {
  const links = [
    row({ id: "1", label: "Vila", category: "restaurante", extra_categories: ["praia", "passeio"] }),
    row({ id: "2", label: "Jantar", category: "restaurante" }),
    row({ id: "3", label: "Orla", category: "praia" }),
  ];

  it("shows an item under an extra category", () => {
    expect(filterLinksByCategory(links, ["passeio"]).map((l) => l.id)).toEqual(["1"]);
    expect(filterLinksByCategory(links, ["praia"]).map((l) => l.id)).toEqual(["1", "3"]);
  });

  it("still matches the main category", () => {
    expect(filterLinksByCategory(links, ["restaurante"]).map((l) => l.id)).toEqual(["1", "2"]);
  });
});

describe("togglePickedCategory (form chips)", () => {
  it("appends in tap order, so the first tap is the main category", () => {
    let picked: string[] = [];
    picked = togglePickedCategory(picked, "restaurante");
    picked = togglePickedCategory(picked, "praia");
    expect(picked).toEqual(["restaurante", "praia"]);
  });

  it("unticking the main promotes the next one", () => {
    expect(togglePickedCategory(["restaurante", "praia", "bar"], "restaurante")).toEqual([
      "praia",
      "bar",
    ]);
  });

  it("unticking an extra keeps the main", () => {
    expect(togglePickedCategory(["restaurante", "praia", "bar"], "praia")).toEqual([
      "restaurante",
      "bar",
    ]);
  });

  it("ignores a fifth category (limit of 4)", () => {
    const four = ["museu", "evento", "restaurante", "bar"];
    expect(togglePickedCategory(four, "praia")).toEqual(four);
  });

  it("Automática (empty value) clears everything", () => {
    expect(togglePickedCategory(["museu", "bar"], "")).toEqual([]);
  });

  it("ignores unknown values", () => {
    expect(togglePickedCategory(["museu"], "churrascaria")).toEqual(["museu"]);
  });
});
