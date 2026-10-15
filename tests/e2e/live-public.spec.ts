import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { reviewOptions } from "../../lib/review-assistance";
const slug = "live_public_test_slug_123456789";
const business = { name: "Actual Test Cafe", category: "Cafe" };
const aiOptions = [
  "My overall experience with Actual Test Cafe was excellent.",
  "Overall, my experience with Actual Test Cafe was excellent.",
  "Based on my experience, my overall impression of Actual Test Cafe is excellent.",
  "My experience with Actual Test Cafe was excellent overall.",
];
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/session")
      ? {
          session_token: "a".repeat(64),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        }
      : path.endsWith("/rewrite")
        ? {
            drafts: reviewOptions(
              route.request().postDataJSON().source_text || "",
              route.request().postDataJSON().optional_rating,
              route.request().postDataJSON().locale,
              business,
            ),
            unchanged: false,
          }
        : path.endsWith("/events")
          ? { accepted: true }
          : {
              label: "Share your experience",
              brand_color: "#315b43",
              location: {
                name: "Actual Test Cafe",
                category: "Cafe",
                locale: "en",
              },
              ai_enabled: true,
            };
    await route.fulfill({ json: { data } });
  });
});
test("every rating keeps the same Google handoff and failed AI preserves original text", async ({
  page,
}) => {
  await page.route("**/api/v1/public/assist/rewrite", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "AI_UNAVAILABLE", message: "Unavailable" } },
    }),
  );
  await page.goto(`/r/${slug}`);
  const google = page.getByRole("link", { name: "Review directly on Google" });
  const href = await google.getAttribute("href");
  await expect(google).toBeVisible();
  await page.getByRole("button", { name: "Write with assistance" }).click();
  for (let n = 1; n <= 5; n++) {
    await page.getByRole("button", { name: `${n} stars`, exact: true }).click();
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute("href", href!);
  }
  const narrative = "The service was slow and our coffee was cold.";
  await page.locator(".experience-details summary").click();
  await page
    .getByLabel("Add details about your experience (optional)", { exact: true })
    .fill(narrative);
  await page.getByRole("button", { name: "Update review options" }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(
    page.getByText("AI assistance is unavailable.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Review option 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Your editable review", { exact: true }),
  ).toHaveValue(narrative);
  await expect(
    page.getByText("AI assistance is unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(google).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify({ localStorage, sessionStorage })),
  ).not.toContain(narrative);
});
test("Hindi keeps direct access and the public landing is accessible", async ({
  page,
}) => {
  await page.goto(`/r/${slug}`);
  await expect(
    page.getByRole("heading", { name: "Actual Test Cafe" }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(
    page.getByRole("link", { name: "सीधे Google पर समीक्षा लिखें" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "लिखने में मदद लें" }).click();
  await page.getByRole("button", { name: "1 स्टार", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("radio", { name: "विकल्प 2", exact: true }).click();
  await expect(
    page.getByLabel("आपकी संपादन योग्य समीक्षा", { exact: true }),
  ).toHaveValue(/Actual Test Cafe.*निराशाजनक/);
  await expect(
    page.getByRole("link", { name: "सीधे Google पर समीक्षा लिखें" }),
  ).toBeVisible();
});
test("inactive live QR has a controlled page", async ({ page }) => {
  await page.route(`**/api/v1/public/qr/${slug}`, (route) =>
    route.fulfill({
      status: 410,
      json: { error: { code: "QR_INACTIVE", message: "Inactive" } },
    }),
  );
  await page.goto(`/r/${slug}`);
  await expect(
    page.getByRole("heading", { name: "This QR is currently unavailable." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review directly on Google" }),
  ).toHaveCount(0);
});

test("stars request four profile options and customers select and edit one", async ({
  page,
}) => {
  const requests: { optional_rating: number; source_text: string }[] = [];
  await page.route("**/api/v1/public/assist/rewrite", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        data: {
          draft: aiOptions[0],
          drafts: aiOptions,
          unchanged: false,
        },
      },
    });
  });
  await page.goto(`/r/${slug}`);
  await page.getByRole("button", { name: "Write with assistance" }).click();
  await page.getByRole("button", { name: "5 stars", exact: true }).click();
  await expect(page.getByText(aiOptions[1], { exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  const editor = page.getByLabel("Your editable review", { exact: true });
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Option 1 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Next suggestion", exact: true })
    .click();
  await expect(page.getByText("Option 2 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Next suggestion", exact: true })
    .click();
  await expect(page.getByText("Option 3 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Previous suggestion", exact: true })
    .click();
  await expect(page.getByText("Option 2 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("radio", { name: "Review option 2", exact: true })
    .click();
  await expect(editor).toHaveValue(aiOptions[1]);
  await expect(page.locator(".review-option.selected textarea")).toHaveCount(1);
  await expect(
    page.locator(".customer-card > .form-stack textarea[data-review-editor]"),
  ).toHaveCount(0);
  await expect(editor).not.toHaveValue(/out of 5|stars/);
  await editor.fill("My own words about Actual Test Cafe.");
  await page
    .getByRole("radio", { name: "Review option 3", exact: true })
    .click();
  await expect(editor).toHaveValue(aiOptions[2]);
  await page
    .getByRole("radio", { name: "Review option 2", exact: true })
    .click();
  await expect(editor).toHaveValue("My own words about Actual Test Cafe.");
  await expect(
    page.getByRole("button", { name: "Copy my words", exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(1);
  expect(requests[0].optional_rating).toBe(5);
  expect(requests[0].source_text).toBe("");
  await expect(
    page.getByRole("link", { name: "Review directly on Google" }),
  ).toBeVisible();
});

test("rapid star changes send only the final rating", async ({ page }) => {
  const ratings: number[] = [];
  await page.route("**/api/v1/public/assist/rewrite", async (route) => {
    ratings.push(route.request().postDataJSON().optional_rating);
    await route.fulfill({
      json: {
        data: { draft: aiOptions[0], drafts: aiOptions, unchanged: false },
      },
    });
  });
  await page.goto(`/r/${slug}`);
  await page.getByRole("button", { name: "Write with assistance" }).click();
  await page.getByRole("button", { name: "1 stars", exact: true }).click();
  await page.getByRole("button", { name: "5 stars", exact: true }).click();
  await expect(page.getByText(aiOptions[0], { exact: true })).toBeVisible();
  await page
    .getByRole("radio", { name: "Review option 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Your editable review", { exact: true }),
  ).toHaveValue(aiOptions[0]);
  expect(ratings).toEqual([5]);
});

test("a late AI response cannot overwrite a customer's edit", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/public/assist/rewrite", async (route) => {
    await hold;
    await route.fulfill({
      json: {
        data: { draft: aiOptions[0], drafts: aiOptions, unchanged: false },
      },
    });
  });
  await page.goto(`/r/${slug}`);
  await page.getByRole("button", { name: "Write with assistance" }).click();
  const started = page.waitForRequest("**/api/v1/public/assist/rewrite");
  await page.getByRole("button", { name: "4 stars", exact: true }).click();
  await started;
  await page
    .getByRole("radio", { name: "Review option 1", exact: true })
    .click();
  const draft = page.getByLabel("Your editable review", { exact: true });
  await draft.fill("These are my own edited words.");
  const completed = page.waitForResponse("**/api/v1/public/assist/rewrite");
  release();
  await completed;
  await expect(draft).toHaveValue("These are my own edited words.");
});
