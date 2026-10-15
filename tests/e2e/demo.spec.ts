import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("dashboard filters and exports CSV", async ({ page }) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", {
      name: "Good things start with a conversation.",
    }),
  ).toBeVisible();
  await page.getByLabel("Filter by location").selectOption("loc-1");
  await page.getByLabel("Date range").selectOption("7");
  await page.getByRole("button", { name: "Export report" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "reputly-demo-analytics.csv",
  );
});
test("creates a location, persists it, and pauses its customer QR", async ({
  page,
}) => {
  await page.goto("/demo/locations");
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  await page.getByLabel("Business name").fill("Test Cafe");
  await page.getByLabel("Neighbourhood / city").fill("Mumbai");
  await page
    .getByRole("button", { name: "Add location", exact: true })
    .last()
    .click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Test Cafe" })).toBeVisible();
  await page.goto("/demo/qr");
  await page
    .getByRole("button", { name: "Create QR code", exact: true })
    .click();
  await page
    .getByLabel("Location", { exact: true })
    .selectOption({ label: "Test Cafe · Mumbai" });
  await page.getByLabel("Display label").fill("Test Counter");
  await page
    .getByRole("button", { name: "Create QR code", exact: true })
    .last()
    .click();
  const card = page.locator(".qr-card").filter({ hasText: "Test Counter" });
  await expect(card).toBeVisible();
  const href = await card
    .getByRole("link", { name: "Try customer view" })
    .getAttribute("href");
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  await page.goto(href!);
  await expect(
    page.getByRole("heading", { name: "This QR is taking a little break." }),
  ).toBeVisible();
});
test("negative feedback retains direct Google access and original words", async ({
  page,
}) => {
  await page.goto("/r/daily-grind-demo-1");
  await expect(
    page.getByRole("button", { name: "Review directly on Google" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Write with assistance" }).click();
  await page.getByRole("button", { name: "1 star", exact: true }).click();
  const narrative = "The food was cold, and we waited for an hour.";
  await page.locator(".experience-details summary").click();
  await page.getByLabel("Your experience", { exact: true }).fill(narrative);
  await expect(
    page.getByRole("button", { name: "Review directly on Google" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review my words" }).click();
  await expect(page.getByLabel("Your editable review")).toHaveValue(narrative);
  await expect(
    page.getByRole("button", { name: "Open Google review page" }),
  ).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain(narrative);
  await page.getByRole("button", { name: "Open Google review page" }).click();
  await expect(
    page.getByRole("heading", { name: "That’s the handoff." }),
  ).toBeVisible();
});
test("Hindi and keyboard-accessible dialog", async ({ page }) => {
  await page.goto("/r/daily-grind-demo-1");
  await page.getByLabel("Language / भाषा").selectOption("hi");
  await expect(
    page.getByRole("button", { name: "सीधे Google पर समीक्षा लिखें" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "सीधे Google पर समीक्षा लिखें" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("customer page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/r/daily-grind-demo-1");
  await expect(
    page.getByRole("button", { name: "Write with assistance" }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});
test("main routes render without client errors or viewport overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/demo",
    "/demo/locations",
    "/demo/qr",
    "/demo/analytics",
    "/demo/team",
    "/demo/billing",
    "/demo/settings",
    "/demo/help",
    "/demo/onboarding",
    "/welcome",
    "/privacy",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("stars create four business options that customers select and edit", async ({
  page,
}) => {
  await page.goto("/r/daily-grind-demo-1");
  await page.getByRole("button", { name: "Write with assistance" }).click();
  await page.getByRole("button", { name: "5 star", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Next suggestion", exact: true })
    .click();
  await expect(page.getByText("Option 2 of 4", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Your editable review", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("radio", { name: "Review option 2", exact: true })
    .click();
  const draft = page.getByLabel("Your editable review", { exact: true });
  await expect(draft).toHaveValue(/Daily Grind/);
  await expect(page.locator(".review-option.selected textarea")).toHaveCount(1);
  await draft.fill("My own edited review.");
  await page
    .getByRole("radio", { name: "Review option 3", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "Review option 2", exact: true })
    .click();
  await expect(
    page.getByLabel("Your editable review", { exact: true }),
  ).toHaveValue("My own edited review.");
  await expect(
    page.getByRole("button", { name: "Copy my words" }),
  ).toBeEnabled();
});
