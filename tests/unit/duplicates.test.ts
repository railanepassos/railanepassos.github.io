import { describe, expect, it } from "vitest";
import { findDuplicate, linkKey } from "../../src/links/duplicates";
import type { LinkRow } from "../../src/links/links-repo";

function row(over: Partial<LinkRow>): LinkRow {
  return {
    id: "id",
    url: "https://example.com/",
    label: "Item",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: null,
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "todo",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...over,
  } as LinkRow;
}

describe("linkKey", () => {
  it("reduces Instagram post, reel and tv links to the shortcode", () => {
    const key = linkKey("https://www.instagram.com/reel/Dd2G_ArTeDF/?utm_source=ig_web_copy_link");
    expect(key).toBe("instagram:Dd2G_ArTeDF");
    expect(linkKey("https://instagram.com/p/Dd2G_ArTeDF")).toBe(key);
    expect(linkKey("https://www.instagram.com/reels/Dd2G_ArTeDF/")).toBe(key);
    expect(linkKey("https://www.instagram.com/tv/Dd2G_ArTeDF/#x")).toBe(key);
    expect(linkKey("https://www.instagram.com/someone/reel/Dd2G_ArTeDF/")).toBe(key);
  });

  it("ignores www, case of host, query, fragment and trailing slash", () => {
    const key = linkKey("https://www.Example.com/lugar/");
    expect(linkKey("https://example.com/lugar?x=1#top")).toBe(key);
    expect(linkKey("https://example.com/outro")).not.toBe(key);
  });

  it("has no key for blank or invalid links", () => {
    expect(linkKey("")).toBeNull();
    expect(linkKey(null)).toBeNull();
    expect(linkKey(undefined)).toBeNull();
    expect(linkKey("not a url")).toBeNull();
  });
});

describe("findDuplicate", () => {
  const links = [
    row({ id: "a", url: "https://cafe.example.com/", source_url: null }),
    row({
      id: "b",
      url: "https://www.instagram.com/reel/Dd2G_ArTeDF/",
      source_url: "https://www.instagram.com/reel/Dd2G_ArTeDF/?igsh=1",
    }),
  ];

  it("finds an item whose link or source post matches either new link", () => {
    expect(findDuplicate(links, { url: "https://cafe.example.com", source_url: "" })?.id).toBe("a");
    expect(
      findDuplicate(links, {
        url: "https://site.example.com/",
        source_url: "https://instagram.com/p/Dd2G_ArTeDF",
      })?.id
    ).toBe("b");
    expect(
      findDuplicate(links, { url: "https://www.instagram.com/p/Dd2G_ArTeDF/", source_url: "" })?.id
    ).toBe("b");
  });

  it("returns null when nothing matches or both links are blank", () => {
    expect(findDuplicate(links, { url: "https://novo.example.com/", source_url: "" })).toBeNull();
    expect(findDuplicate(links, { url: "", source_url: "" })).toBeNull();
  });
});
