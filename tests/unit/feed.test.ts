import { describe, expect, it } from "vitest";
import {
  categoryCounts,
  displayTitle,
  linkDomain,
  linksForSection,
  sectionCounts,
  toggleCategory,
} from "../../src/links/feed";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id-1",
    url: "https://example.com",
    label: "Exemplo",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
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

describe("linkDomain", () => {
  it("returns the hostname without www", () => {
    expect(linkDomain("https://www.instagram.com/p/abc/")).toBe("instagram.com");
  });

  it("returns an empty string for an invalid URL", () => {
    expect(linkDomain("nope")).toBe("");
  });
});

describe("displayTitle", () => {
  it("keeps a proper label", () => {
    expect(displayTitle(row({ label: "Casa Jorge Amado" }))).toBe("Casa Jorge Amado");
  });

  it("derives a place name from a Google Maps place URL", () => {
    expect(
      displayTitle(
        row({
          label: "google.com",
          url: "https://www.google.com/maps/place/Casa+Jorge+Amado/@-12.9,-38.5,17z",
        })
      )
    ).toBe("Casa Jorge Amado");
  });

  it("uses the q query parameter when present", () => {
    expect(
      displayTitle(
        row({ label: "google.com", url: "https://google.com/search?q=praia%20do%20forte" })
      )
    ).toBe("Praia do forte");
  });

  it("labels Instagram posts and reels", () => {
    expect(
      displayTitle(row({ label: "instagram.com", url: "https://www.instagram.com/p/C1x2y3/" }))
    ).toBe("Post do Instagram");
    expect(
      displayTitle(row({ label: "instagram.com", url: "https://instagram.com/reel/XYZ/" }))
    ).toBe("Reel do Instagram");
  });

  it("labels an Instagram profile with its handle", () => {
    expect(
      displayTitle(row({ label: "instagram.com", url: "https://instagram.com/museudomar/" }))
    ).toBe("@museudomar");
  });

  it("turns a readable path slug into words", () => {
    expect(
      displayTitle(
        row({ label: "example.com", url: "https://example.com/roteiros/casa-do-rio_vermelho.html" })
      )
    ).toBe("Casa do rio vermelho");
  });

  it("falls back to the domain when the path has no readable slug", () => {
    expect(
      displayTitle(row({ label: "example.com", url: "https://example.com/12345" }))
    ).toBe("example.com");
  });

  it("derives a title when the label is blank", () => {
    expect(
      displayTitle(row({ label: "", url: "https://example.com/parque-da-cidade" }))
    ).toBe("Parque da cidade");
  });
});

describe("linksForSection", () => {
  const links = [
    row({ id: "a" }),
    row({
      id: "b",
      scheduled_start: "2026-12-10T09:00:00-03:00",
      scheduled_end: "2026-12-10T17:00:00-03:00",
    }),
    row({
      id: "c",
      scheduled_start: "2026-12-01T09:00:00-03:00",
      scheduled_end: "2026-12-01T17:00:00-03:00",
    }),
    row({ id: "d", status: "done", completed_at: "2026-10-01T00:00:00Z" }),
    row({ id: "e", status: "done", completed_at: "2026-11-01T00:00:00Z" }),
  ];

  it("feed excludes done items", () => {
    expect(linksForSection(links, "feed").map((l) => l.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("agenda lists scheduled wishlist items by start date", () => {
    expect(linksForSection(links, "agenda").map((l) => l.id)).toEqual(["c", "b"]);
  });

  it("done lists completed items, most recent first", () => {
    expect(linksForSection(links, "done").map((l) => l.id)).toEqual(["e", "d"]);
  });

  it("sectionCounts counts each section", () => {
    expect(sectionCounts(links)).toEqual({ feed: 3, agenda: 2, done: 2 });
  });
});

describe("categoryCounts", () => {
  it("counts resolved categories in option order and skips empty ones", () => {
    const counts = categoryCounts([
      row({ category: "praia" }),
      row({ category: "museu" }),
      row({ category: "praia" }),
      row({ category: null, label: "Trilha da Lagoa" }),
    ]);
    expect(counts).toEqual([
      { category: "museu", count: 1 },
      { category: "trilha", count: 1 },
      { category: "praia", count: 2 },
    ]);
  });
});

describe("categoryCounts with extra categories", () => {
  it("counts an item once under each of its categories", () => {
    const counts = categoryCounts([
      row({ category: "restaurante", extra_categories: ["praia", "passeio"] }),
      row({ category: "praia" }),
    ]);
    expect(counts).toEqual([
      { category: "restaurante", count: 1 },
      { category: "praia", count: 2 },
      { category: "passeio", count: 1 },
    ]);
  });
});

describe("toggleCategory", () => {
  it("adds a category keeping option order", () => {
    expect(toggleCategory(["praia"], "museu")).toEqual(["museu", "praia"]);
  });

  it("removes a selected category", () => {
    expect(toggleCategory(["museu", "praia"], "museu")).toEqual(["praia"]);
  });
});
