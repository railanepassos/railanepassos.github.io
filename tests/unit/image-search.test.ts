import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_SEARCH_TIMEOUT_MS,
  buildImageSearchUrl,
  parseImageSearch,
  searchImages,
} from "../../src/links/image-search";

const THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/800px-Foto.jpg";

describe("buildImageSearchUrl", () => {
  it("targets pt.wikipedia with the search parameters", () => {
    const url = new URL(buildImageSearchUrl("Museu do Amanhã", "Rio de Janeiro"));
    expect(url.origin).toBe("https://pt.wikipedia.org");
    expect(url.pathname).toBe("/w/api.php");
    const p = url.searchParams;
    expect(p.get("action")).toBe("query");
    expect(p.get("generator")).toBe("search");
    expect(p.get("gsrsearch")).toBe("Museu do Amanhã Rio de Janeiro");
    expect(p.get("gsrlimit")).toBe("6");
    expect(p.get("prop")).toBe("pageimages");
    expect(p.get("piprop")).toBe("thumbnail");
    expect(p.get("pithumbsize")).toBe("800");
    expect(p.get("format")).toBe("json");
    expect(p.get("origin")).toBe("*");
  });

  it("encodes accents and drops an empty city", () => {
    const url = buildImageSearchUrl("  Pão de Açúcar ", "  ");
    expect(new URL(url).searchParams.get("gsrsearch")).toBe("Pão de Açúcar");
    expect(url).not.toContain(" ");
  });
});

describe("parseImageSearch", () => {
  it("returns [] without a query", () => {
    expect(parseImageSearch({})).toEqual([]);
    expect(parseImageSearch(null)).toEqual([]);
    expect(parseImageSearch("x")).toEqual([]);
    expect(parseImageSearch({ query: { pages: "x" } })).toEqual([]);
  });

  it("skips pages without thumbnail and orders by search index", () => {
    const json = {
      query: {
        pages: {
          "1": { title: "Terceira", index: 3, thumbnail: { source: THUMB.replace("Foto", "C") } },
          "2": { title: "Sem foto", index: 2 },
          "3": { title: "Primeira", index: 1, thumbnail: { source: THUMB.replace("Foto", "A") } },
        },
      },
    };
    expect(parseImageSearch(json)).toEqual([
      { title: "Primeira", url: THUMB.replace("Foto", "A") },
      { title: "Terceira", url: THUMB.replace("Foto", "C") },
    ]);
  });

  it("rejects other hosts, http and lookalikes", () => {
    const bad = [
      "https://evil.example/x.jpg",
      "http://upload.wikimedia.org/x.jpg",
      "https://upload.wikimedia.org.evil.example/x.jpg",
      "https://evil.example/https://upload.wikimedia.org/x.jpg",
      "javascript:alert(1)",
    ];
    const pages = Object.fromEntries(
      bad.map((source, i) => [String(i), { title: `T${i}`, index: i, thumbnail: { source } }])
    );
    expect(parseImageSearch({ query: { pages } })).toEqual([]);
  });

  it("ignores pages with a non-string title or malformed thumbnail", () => {
    const pages = {
      a: { title: 5, index: 1, thumbnail: { source: THUMB } },
      b: { title: "ok", index: 2, thumbnail: "x" },
      c: null,
    };
    expect(parseImageSearch({ query: { pages } })).toEqual([]);
  });
});

function okResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe("searchImages", () => {
  it("fetches with credentials omitted and parses the result", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({ query: { pages: { "1": { title: "A", index: 1, thumbnail: { source: THUMB } } } } })
    );
    const out = await searchImages("Museu", "Rio", fetchFn as unknown as typeof fetch);
    expect(out).toEqual([{ title: "A", url: THUMB }]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe(buildImageSearchUrl("Museu", "Rio"));
    expect(init.credentials).toBe("omit");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects on a non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    await expect(searchImages("A", "", fetchFn as unknown as typeof fetch)).rejects.toThrow();
  });

  it("rejects on a network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(searchImages("A", "", fetchFn as unknown as typeof fetch)).rejects.toThrow("offline");
  });

  it("aborts after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn((_u: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        })
      );
      const p = searchImages("A", "", fetchFn as unknown as typeof fetch);
      const assertion = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(IMAGE_SEARCH_TIMEOUT_MS + 10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts when the caller's signal aborts", async () => {
    const fetchFn = vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      })
    );
    const ctl = new AbortController();
    const p = searchImages("A", "", fetchFn as unknown as typeof fetch, ctl.signal);
    ctl.abort();
    await expect(p).rejects.toThrow();
  });

  it("rejects right away when the signal is already aborted", async () => {
    const fetchFn = vi.fn();
    const ctl = new AbortController();
    ctl.abort();
    await expect(searchImages("A", "", fetchFn as unknown as typeof fetch, ctl.signal)).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
