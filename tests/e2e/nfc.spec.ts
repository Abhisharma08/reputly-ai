import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const org = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000003";
const slug = "nfc_browser_fixture_slug_123456789";
test.beforeEach(async ({ page }) => {
  const codes: Record<string, unknown>[] = [];
  await page.route("**/api/v1/orgs/**", async route => {
    const req = route.request();
    let data: unknown;
    if (req.method() === "POST") {
      expect(req.headers()["idempotency-key"]).toBeTruthy();
      const body = req.postDataJSON();
      expect(body.channel).toBe("nfc");
      const code = { ...body, id: "nfc-1", slug, is_active: true, organization_id: org, created_at: "2026-10-15" };
      codes.push(code); data = code;
    } else if (req.method() === "PATCH") {
      Object.assign(codes[0], req.postDataJSON()); data = codes[0];
    } else {
      data = { organization: { id: org, name: "Test Workspace" }, role: "organization_admin", public_base_url: "https://reviews.example", codes, locations: [{ id: locationId, name: "Downtown Cafe", status: "active" }] };
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("http://127.0.0.1:4180/");
});
async function createTag(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add NFC tag" }).click();
  await page.getByLabel("Tag name").fill("Reception stand");
  await page.getByLabel("Placement (optional)").fill("Front desk");
  await page.getByRole("button", { name: "Save NFC tag" }).click();
  await expect(page.getByRole("heading", { name: "Reception stand" })).toBeVisible();
}
test("registers, searches, edits and pauses an NFC tag with stable destination", async ({ page }) => {
  await createTag(page);
  await page.getByLabel("Search NFC tags").fill("missing");
  await expect(page.getByRole("heading", { name: "No matching tags" })).toBeVisible();
  await page.getByLabel("Search NFC tags").fill("front desk");
  await page.getByRole("button", { name: "Edit tag" }).click();
  await page.getByLabel("Tag name").fill("Lobby stand");
  await page.getByRole("button", { name: "Save NFC tag" }).click();
  await expect(page.getByRole("heading", { name: "Lobby stand" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Preview page" })).toHaveAttribute("href", `https://reviews.example/r/${slug}`);
  await page.getByRole("button", { name: "Pause tag" }).click();
  await expect(page.getByRole("button", { name: "Program chip" })).toBeDisabled();
  await page.getByLabel("Filter NFC status").selectOption("paused");
  await expect(page.getByRole("heading", { name: "Lobby stand" })).toBeVisible();
  await page.getByRole("button", { name: "Enable tag" }).click();
  await expect(page.getByRole("heading", { name: "No matching tags" })).toBeVisible();
});
test("unsupported devices get a copyable URL and fallback QR, with accessible responsive UI", async ({ page }) => {
  await createTag(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const inventory = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(inventory.violations).toEqual([]);
  await page.getByRole("button", { name: "Program chip" }).click();
  await expect(page.getByLabel("Chip destination")).toHaveValue(`https://reviews.example/r/${slug}`);
  await expect(page.getByText(/open this workspace in Chrome/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Write to NFC chip" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Fallback QR" }).click();
  expect((await download).suggestedFilename()).toBe("reception-stand.png");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `outputs/nfc-${test.info().project.name}.png`, fullPage: true });
});
test("writes a URL record and cancels a pending NFC operation", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as { NDEFReader: unknown; written: unknown };
    host.NDEFReader = class { async write(message: unknown, options: { signal: AbortSignal; overwrite: boolean }) { host.written = { message, overwrite: options.overwrite }; } };
  });
  await createTag(page);
  await page.getByRole("button", { name: "Program chip" }).click();
  await page.getByRole("button", { name: "Write to NFC chip" }).click();
  await expect(page.getByText(/Link written successfully/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { written: unknown }).written)).toEqual({ message: { records: [{ recordType: "url", data: `https://reviews.example/r/${slug}` }] }, overwrite: false });
  await page.evaluate(() => {
    (window as unknown as { NDEFReader: unknown }).NDEFReader = class { write(_: unknown, options: { signal: AbortSignal }) { return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")))); } };
  });
  await page.getByRole("button", { name: "Write to NFC chip" }).click();
  await page.getByRole("button", { name: "Cancel writing" }).click();
  await expect(page.getByRole("alert")).toContainText("Writing stopped");
});
