import { describe, expect, it } from "vitest";
import { createKeyedQueue } from "../../src/links/keyed-queue";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createKeyedQueue", () => {
  it("runs tasks of the same key one after another", async () => {
    const run = createKeyedQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = run("k", async () => {
      order.push("a:start");
      await gate;
      order.push("a:end");
    });
    const b = run("k", async () => {
      order.push("b:start");
    });
    await flush();
    expect(order).toEqual(["a:start"]);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("does not block other keys", async () => {
    const run = createKeyedQueue();
    const gate = new Promise<void>(() => undefined);
    void run("x", () => gate);
    await expect(run("y", async () => 7)).resolves.toBe(7);
  });

  it("a rejected task rejects its caller but not the next task", async () => {
    const run = createKeyedQueue();
    const a = run("k", async () => {
      throw new Error("boom");
    });
    const b = run("k", async () => "ok");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("ok");
  });
});
