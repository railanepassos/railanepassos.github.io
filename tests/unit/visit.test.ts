import { describe, expect, it } from "vitest";
import {
  isVisitFragment,
  isVisitToday,
  parseVisitFragment,
  pendingVisitAction,
  planProgress,
  todayVisits,
  visitFragment,
  visitTabs,
} from "../../src/links/visit";
import type { LinkRow } from "../../src/links/links-repo";
import type { PlanItem } from "../../src/links/plan";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id",
    url: "https://example.com",
    label: "Lugar",
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

const item = (list: PlanItem["list"], done = false): PlanItem => ({ text: "x", list, done });

/** ISO string for a local wall-clock time, so tests do not depend on the machine zone. */
const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): string =>
  new Date(y, m - 1, d, h, min, s, ms).toISOString();

describe("visitTabs", () => {
  it("always has roteiro, even for an empty link", () => {
    expect(visitTabs(row())).toEqual(["roteiro"]);
  });

  it("adds checklist when either list has an item", () => {
    expect(visitTabs(row({ plan_items: [item("checklist")] }))).toEqual(["roteiro", "checklist"]);
    expect(visitTabs(row({ plan_items: [item("compras")] }))).toEqual(["roteiro", "checklist"]);
    expect(visitTabs(row({ plan_items: [] }))).toEqual(["roteiro"]);
    expect(visitTabs(row({ plan_items: null }))).toEqual(["roteiro"]);
  });

  it("adds historia only for a non-blank dossier", () => {
    expect(visitTabs(row({ dossier: "Era uma vez" }))).toEqual(["roteiro", "historia"]);
    expect(visitTabs(row({ dossier: "   \n " }))).toEqual(["roteiro"]);
    expect(visitTabs(row({ dossier: null }))).toEqual(["roteiro"]);
  });

  it("adds poses when at least one ref has url or note", () => {
    expect(visitTabs(row({ pose_refs: [{ url: "https://a.com/p" }] }))).toContain("poses");
    expect(visitTabs(row({ pose_refs: [{ note: "de lado" }] }))).toContain("poses");
    expect(visitTabs(row({ pose_refs: [{}] }))).toEqual(["roteiro"]);
    expect(visitTabs(row({ pose_refs: [{ url: "", note: " " }] }))).toEqual(["roteiro"]);
    expect(visitTabs(row({ pose_refs: [] }))).toEqual(["roteiro"]);
    expect(visitTabs(row({ pose_refs: null }))).toEqual(["roteiro"]);
  });

  it("keeps the order roteiro, checklist, historia, poses", () => {
    const link = row({
      plan_items: [item("checklist")],
      dossier: "texto",
      pose_refs: [{ note: "n" }],
    });
    expect(visitTabs(link)).toEqual(["roteiro", "checklist", "historia", "poses"]);
  });
});

describe("isVisitToday", () => {
  const now = new Date(2026, 10, 22, 14, 30);

  it("is true for a wishlist item scheduled later today", () => {
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 22, 18, 0) }), now)).toBe(true);
  });

  it("is true on the first and last millisecond of the local day", () => {
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 22, 0, 0, 0, 0) }), now)).toBe(true);
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 22, 23, 59, 59, 999) }), now)).toBe(true);
  });

  it("is false the day before and the day after (local boundary)", () => {
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 21, 23, 59, 59, 999) }), now)).toBe(false);
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 23, 0, 0, 0, 0) }), now)).toBe(false);
  });

  it("depends on the local date of now, not UTC", () => {
    const lateNow = new Date(2026, 10, 22, 23, 59);
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 22, 8, 0) }), lateNow)).toBe(true);
    const earlyNow = new Date(2026, 10, 23, 0, 1);
    expect(isVisitToday(row({ scheduled_start: local(2026, 11, 22, 23, 0) }), earlyNow)).toBe(false);
  });

  it("is false for done items", () => {
    const link = row({ status: "done", scheduled_start: local(2026, 11, 22, 18, 0) });
    expect(isVisitToday(link, now)).toBe(false);
  });

  it("is false for null or invalid dates", () => {
    expect(isVisitToday(row({ scheduled_start: null }), now)).toBe(false);
    expect(isVisitToday(row({ scheduled_start: "nope" }), now)).toBe(false);
    expect(isVisitToday(row({ scheduled_start: "" }), now)).toBe(false);
  });
});

describe("todayVisits", () => {
  const now = new Date(2026, 10, 22, 9, 0);

  it("keeps only today's wishlist visits, earliest first", () => {
    const out = todayVisits(
      [
        row({ id: "late", scheduled_start: local(2026, 11, 22, 17, 0) }),
        row({ id: "tomorrow", scheduled_start: local(2026, 11, 23, 9, 0) }),
        row({ id: "done", status: "done", scheduled_start: local(2026, 11, 22, 8, 0) }),
        row({ id: "early", scheduled_start: local(2026, 11, 22, 10, 0) }),
        row({ id: "none" }),
      ],
      now
    );
    expect(out.map((l) => l.id)).toEqual(["early", "late"]);
  });

  it("is stable for equal times and does not mutate the input", () => {
    const start = local(2026, 11, 22, 12, 0);
    const input = [
      row({ id: "b", scheduled_start: start }),
      row({ id: "a", scheduled_start: start }),
    ];
    const out = todayVisits(input, now);
    expect(out.map((l) => l.id)).toEqual(["b", "a"]);
    expect(input.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list when nothing is today", () => {
    expect(todayVisits([], now)).toEqual([]);
  });
});

describe("planProgress", () => {
  const items: PlanItem[] = [
    { text: "a", list: "checklist", done: true },
    { text: "b", list: "checklist", done: false },
    { text: "c", list: "compras", done: true },
    { text: "d", list: "compras", done: true },
  ];

  it("counts done and total of one list", () => {
    expect(planProgress(items, "checklist")).toEqual({ done: 1, total: 2 });
    expect(planProgress(items, "compras")).toEqual({ done: 2, total: 2 });
  });

  it("is 0/0 for null, undefined or empty", () => {
    expect(planProgress(null, "checklist")).toEqual({ done: 0, total: 0 });
    expect(planProgress(undefined, "compras")).toEqual({ done: 0, total: 0 });
    expect(planProgress([], "checklist")).toEqual({ done: 0, total: 0 });
  });
});

describe("visit fragment", () => {
  it("recognizes the prefix", () => {
    expect(isVisitFragment("#visita/abc")).toBe(true);
    expect(isVisitFragment("#visita/")).toBe(true);
    expect(isVisitFragment("#plano=abc")).toBe(false);
    expect(isVisitFragment("")).toBe(false);
  });

  it("parses uuid-like ids", () => {
    const id = "3f2b8c1e-9a4d-4e7b-8c11-0123456789ab";
    expect(parseVisitFragment(`#visita/${id}`)).toBe(id);
    expect(parseVisitFragment("#visita/AbC-123")).toBe("AbC-123");
  });

  it("rejects empty and garbage ids", () => {
    expect(parseVisitFragment("#visita/")).toBeNull();
    expect(parseVisitFragment("#visita/a/b")).toBeNull();
    expect(parseVisitFragment("#visita/a b")).toBeNull();
    expect(parseVisitFragment("#visita/<script>")).toBeNull();
    expect(parseVisitFragment("#visita/a?x=1")).toBeNull();
    expect(parseVisitFragment("#outro/abc")).toBeNull();
    expect(parseVisitFragment("")).toBeNull();
  });

  it("builds the fragment and round-trips", () => {
    expect(visitFragment("abc-1")).toBe("#visita/abc-1");
    expect(parseVisitFragment(visitFragment("abc-1"))).toBe("abc-1");
  });
});

describe("pendingVisitAction", () => {
  const base = { authenticated: true, listLoadFailed: false, targetOpenable: true };
  it("waits while logged out", () => {
    expect(pendingVisitAction({ ...base, authenticated: false })).toBe("wait");
  });
  it("keeps the fragment (waits) when the list failed to load", () => {
    expect(pendingVisitAction({ ...base, listLoadFailed: true, targetOpenable: false })).toBe("wait");
  });
  it("opens an openable target", () => {
    expect(pendingVisitAction(base)).toBe("open");
  });
  it("clears the fragment when the target is missing or done", () => {
    expect(pendingVisitAction({ ...base, targetOpenable: false })).toBe("clear");
  });
});
