import { describe, expect, it } from "vitest";
import { parseMemoryLink } from "../../src/links/memory-link";

const ID = "dQw4w9WgXcQ";
const youtube = (id: string) => ({
  kind: "youtube",
  videoId: id,
  watchUrl: `https://www.youtube.com/watch?v=${id}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});

describe("parseMemoryLink: YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://youtu.be/${ID}?si=abc123&t=10`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `  https://youtu.be/${ID}  `,
    `https://YOUTU.BE/${ID}`,
  ])("recognises %s", (url) => {
    expect(parseMemoryLink(url)).toEqual(youtube(ID));
  });

  it("falls back to album for YouTube pages that are not a single video", () => {
    expect(parseMemoryLink("https://www.youtube.com/@canal")).toEqual({
      kind: "album",
      url: "https://www.youtube.com/@canal",
    });
    expect(parseMemoryLink("https://www.youtube.com/watch?v=curto")).toMatchObject({
      kind: "album",
    });
    expect(parseMemoryLink("https://youtu.be/")).toMatchObject({ kind: "album" });
  });

  it("does not treat look-alike hosts as YouTube", () => {
    expect(parseMemoryLink(`https://youtube.com.evil.example/watch?v=${ID}`)).toMatchObject({
      kind: "album",
    });
    expect(parseMemoryLink(`https://notyoutu.be/${ID}`)).toMatchObject({ kind: "album" });
  });
});

describe("parseMemoryLink: album and rejects", () => {
  it("any other https link is an album", () => {
    expect(parseMemoryLink("https://photos.app.goo.gl/AbCdEf")).toEqual({
      kind: "album",
      url: "https://photos.app.goo.gl/AbCdEf",
    });
  });

  it("returns null for empty, non-https and garbage", () => {
    for (const bad of ["", "   ", "http://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)", "foto", null, undefined]) {
      expect(parseMemoryLink(bad)).toBeNull();
    }
  });
});
