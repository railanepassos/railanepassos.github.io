import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 3: memory link (YouTube thumbnail or album) in "Como foi". Fake data only. */

const VIDEO_ID = "dQw4w9WgXcQ";
const YOUTUBE_URL = `https://youtu.be/${VIDEO_ID}?si=fake`;

const TODO = {
  id: "00000000-0000-4000-8000-0000000000c1",
  url: "https://example.com/lugar-memoria",
  label: "Lugar Memoria",
  description: null,
  icon_preset: null,
  icon_url: null,
  category: "museu",
  sort_order: 10,
  scheduled_start: null,
  scheduled_end: null,
  status: "wishlist",
  priority: 0,
  want_again: false,
  image_url: null,
  note: null,
  completed_at: null,
  created_at: "2026-11-10T12:00:00Z",
};

const DONE = {
  ...TODO,
  id: "00000000-0000-4000-8000-0000000000c2",
  url: "https://example.com/lugar-feito",
  label: "Lugar Feito",
  sort_order: 11,
  status: "done",
  completed_at: "2026-12-12T15:00:00Z",
};

const PIXEL = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
), (c) => c.charCodeAt(0));

async function stubThumbnails(page: Page, ok: boolean): Promise<string[]> {
  const requested: string[] = [];
  await page.route("https://i.ytimg.com/**", async (route) => {
    requested.push(route.request().url());
    if (ok) await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    else await route.abort();
  });
  return requested;
}

async function goToDone(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="done"]').click();
}

async function openDetail(page: Page, title: string): Promise<void> {
  await goToDone(page);
  await page.locator(".feed-card", { hasText: title }).locator(".feed-card__open").click();
}

test.describe("Como foi memory link", () => {
  test("saving a YouTube link from the sheet, then the detail shows thumbnail and Assistir", async ({ page }) => {
    const requested = await stubThumbnails(page, true);
    const writes = await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await page
      .locator(".feed-card", { hasText: "Lugar Memoria" })
      .getByRole("button", { name: "Marcar Lugar Memoria como feito" })
      .click();

    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByLabel("Link da memória").fill(YOUTUBE_URL);
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();

    expect(writes.allPatched[1]).toMatchObject({ memory_url: YOUTUBE_URL });

    await openDetail(page, "Lugar Memoria");
    const memory = page.locator(".links-detail [data-field='memory_url']");
    await expect(memory).toBeVisible();
    const thumb = memory.locator("img");
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveAttribute(
      "src",
      `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    );
    const watch = memory.getByRole("link", { name: "Assistir" });
    await expect(watch).toHaveAttribute("href", `https://www.youtube.com/watch?v=${VIDEO_ID}`);
    await expect(watch).toHaveAttribute("target", "_blank");
    await expect(watch).toHaveAttribute("rel", "noopener noreferrer");
    await expect(memory.locator("iframe")).toHaveCount(0);
    expect(requested.length).toBeGreaterThan(0);
  });

  test("an album link shows Ver álbum without any thumbnail", async ({ page }) => {
    const requested = await stubThumbnails(page, true);
    const writes = await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='memory_url']")).toBeHidden();

    await detail.getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByLabel("Link da memória").fill("https://photos.app.goo.gl/AbCdEfFake");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ memory_url: "https://photos.app.goo.gl/AbCdEfFake" });

    const memory = detail.locator("[data-field='memory_url']");
    await expect(memory).toBeVisible();
    await expect(memory.locator("img")).toBeHidden();
    const album = memory.getByRole("link", { name: "Ver álbum" });
    await expect(album).toHaveAttribute("href", "https://photos.app.goo.gl/AbCdEfFake");
    await expect(album).toHaveAttribute("target", "_blank");
    await expect(album).toHaveAttribute("rel", "noopener noreferrer");
    expect(requested).toHaveLength(0);
  });

  test("a non-https link shows the inline error and is not saved", async ({ page }) => {
    const writes = await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const input = sheet.getByLabel("Link da memória");
    await input.fill("http://example.com/foto");
    const error = sheet.locator("#links-review-memory-url-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("https");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute("aria-describedby", "links-review-memory-url-error");

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByRole("alert")).toContainText("https");
    expect(writes.patched).toBeNull();

    await input.fill("https://example.com/foto");
    await expect(error).toBeHidden();
  });

  test("a thumbnail that fails to load is hidden and Assistir keeps working", async ({ page }) => {
    await stubThumbnails(page, false);
    await openAuthedWith(page, [{ ...DONE, memory_url: YOUTUBE_URL }, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    const memory = page.locator(".links-detail [data-field='memory_url']");
    await expect(memory).toBeVisible();
    await expect(memory.locator("img")).toBeHidden();
    await expect(memory.getByRole("link", { name: "Assistir" })).toBeVisible();
    await expect(memory.getByRole("link", { name: "Assistir" })).toHaveAttribute(
      "href",
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
  });

  test("clearing the link saves null and removes the block", async ({ page }) => {
    await stubThumbnails(page, true);
    const writes = await openAuthedWith(page, [
      { ...DONE, memory_url: "https://photos.app.goo.gl/AbCdEfFake" },
      ...LINK_ROWS,
    ]);
    await openDetail(page, "Lugar Feito");
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='memory_url']")).toBeVisible();
    await detail.getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const input = sheet.getByLabel("Link da memória");
    await expect(input).toHaveValue("https://photos.app.goo.gl/AbCdEfFake");
    await input.fill("");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ memory_url: null });
    await expect(detail.locator("[data-field='memory_url']")).toBeHidden();
  });
});
