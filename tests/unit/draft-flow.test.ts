import { describe, expect, it, vi } from "vitest";
import { createDraftFlow } from "../../src/links/draft-flow";
import type { Draft } from "../../src/links/draft";

type L = { id: string };
const IDS = [1, 2, 3].map((n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
const upd = (id: string, plan = false): Draft =>
  ({ v: 1, kind: "atualizacao", id, fields: { description: `Texto ${id.slice(0, 1)}` }, ...(plan ? { plan: [{ type: "checklist", text: "Protetor" }] } : {}) }) as unknown as Draft;

function setup(known: string[] = IDS, idle = true) {
  const opened: string[] = [];
  const plans: string[] = [];
  const planHooks: Array<{ onSaved: () => void; onSkipped: () => void }> = [];
  const notices: string[] = [];
  const flow = createDraftFlow<L>({
    openCreate: (_p, title) => opened.push(`create:${title ?? ""}`),
    openEdit: (l) => opened.push(`edit:${l.id}`),
    openPlan: (l, _i, hooks) => {
      plans.push(l.id);
      planHooks.push(hooks);
    },
    findLink: (id) => (known.includes(id) ? { id } : undefined),
    isIdle: () => idle,
    notify: (m) => notices.push(m),
    listLoadFailed: () => false,
    defer: (fn) => fn(),
  });
  return { flow, opened, plans, planHooks, notices };
}

describe("draft flow: several updates from one request", () => {
  it("save, cancel, save opens all three and marks done once", () => {
    const { flow, opened } = setup();
    const done = vi.fn();
    flow.reviewDrafts(IDS.map((id) => upd(id)), done);
    expect(opened).toEqual([`edit:${IDS[0]}`]);
    flow.formSaved(IDS[0]);
    expect(opened).toHaveLength(2);
    flow.formDismissed();
    expect(opened).toEqual(IDS.map((id) => `edit:${id}`));
    expect(done).not.toHaveBeenCalled();
    flow.formSaved(IDS[2]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("dismissing every draft leaves the request ready (onDone never runs)", () => {
    const { flow, opened } = setup();
    const done = vi.fn();
    flow.reviewDrafts(IDS.map((id) => upd(id)), done);
    flow.formDismissed();
    flow.formDismissed();
    flow.formDismissed();
    expect(opened).toHaveLength(3);
    expect(done).not.toHaveBeenCalled();
  });

  it("closing the last draft after saving the others still marks done", () => {
    const { flow } = setup();
    const done = vi.fn();
    flow.reviewDrafts([upd(IDS[0]), upd(IDS[1])], done);
    flow.formSaved(IDS[0]);
    flow.formDismissed();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("a missing item in the middle shows a notice and the chain goes on", () => {
    const { flow, opened, notices } = setup([IDS[0], IDS[2]]);
    const done = vi.fn();
    flow.reviewDrafts(IDS.map((id) => upd(id)), done);
    flow.formSaved(IDS[0]);
    expect(notices).toHaveLength(1);
    expect(opened).toEqual([`edit:${IDS[0]}`, `edit:${IDS[2]}`]);
    flow.formSaved(IDS[2]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("a draft that only has a plan ends when the plan sheet is saved or skipped", () => {
    const { flow, plans, planHooks } = setup();
    const done = vi.fn();
    const planOnly = { v: 1, kind: "atualizacao", id: IDS[0], plan: [{ type: "checklist", text: "x" }] } as unknown as Draft;
    flow.reviewDrafts([planOnly, upd(IDS[1])], done);
    expect(plans).toEqual([IDS[0]]);
    planHooks[0].onSkipped();
    flow.formSaved(IDS[1]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("saving fields then a plan: the plan sheet closing ends the draft as saved", () => {
    const { flow, plans, planHooks } = setup();
    const done = vi.fn();
    flow.reviewDrafts([upd(IDS[0], true)], done);
    flow.formSaved(IDS[0]);
    expect(plans).toEqual([IDS[0]]);
    expect(done).not.toHaveBeenCalled();
    planHooks[0].onSkipped();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("reset stops the chain", () => {
    const { flow, opened } = setup();
    const done = vi.fn();
    flow.reviewDrafts(IDS.map((id) => upd(id)), done);
    flow.reset();
    flow.formSaved(IDS[0]);
    expect(opened).toHaveLength(1);
    expect(done).not.toHaveBeenCalled();
  });
});

describe("draft flow: fila (new items one by one)", () => {
  const fila = { v: 1, kind: "fila", items: [1, 2, 3].map((n) => ({ url: `https://example.com/${n}`, label: `L${n}` })) } as unknown as Draft;

  it("saves 1 and 2, closes the last: the draft still ends as saved", () => {
    const { flow, opened } = setup();
    const end = vi.fn();
    flow.openDraft(fila, end);
    flow.formSaved(null);
    flow.formSaved(null);
    expect(opened).toHaveLength(3);
    expect(end).not.toHaveBeenCalled();
    flow.formDismissed();
    expect(end).toHaveBeenCalledWith(true);
  });

  it("closing every item ends as not saved", () => {
    const { flow } = setup();
    const end = vi.fn();
    flow.openDraft(fila, end);
    flow.formDismissed();
    flow.formDismissed();
    flow.formDismissed();
    expect(end).toHaveBeenCalledWith(false);
  });

  it("skipping the middle and saving the last counts as saved; a duplicate counts as skipped", () => {
    const { flow } = setup();
    const end = vi.fn();
    flow.openDraft(fila, end);
    flow.formSaved(null);
    flow.duplicateOpened();
    flow.formSaved(null);
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(true);
  });

  it("waits for the detail to close before opening the next item", () => {
    let idle = false;
    const opened: string[] = [];
    const flow = createDraftFlow<L>({
      openCreate: (_p, t) => opened.push(t ?? ""),
      openEdit: () => undefined,
      openPlan: () => undefined,
      findLink: () => undefined,
      isIdle: () => idle,
      notify: () => undefined,
      listLoadFailed: () => false,
      defer: (fn) => fn(),
    });
    flow.openDraft(fila);
    flow.duplicateOpened();
    expect(opened).toHaveLength(1);
    idle = true;
    flow.resumeQueue();
    expect(opened).toHaveLength(2);
  });
});
