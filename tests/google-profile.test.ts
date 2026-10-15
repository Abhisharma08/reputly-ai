import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  googleBusinessProfile,
  websiteURL,
} from "../lib/server/google-profile";
import { ApiError } from "../lib/server/config";

describe("Google business context", () => {
  it("loads a bounded profile from the exact Places host without keys in URLs or customer reviews", async () => {
    const original = globalThis.fetch,
      key = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "private-places-test-key";
    let calls = 0;
    globalThis.fetch = async (input, options) => {
      calls++;
      const url = new URL(String(input)),
        headers = new Headers(options?.headers);
      assert.equal(url.hostname, "places.googleapis.com");
      assert.equal(url.pathname, "/v1/places/ChITest123");
      assert.equal(url.searchParams.has("key"), false);
      assert.equal(headers.get("x-goog-api-key"), "private-places-test-key");
      assert.doesNotMatch(
        headers.get("x-goog-fieldmask")!,
        /reviews|rating|\*/i,
      );
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.redirect, "error");
      return Response.json({
        id: "ChITest123",
        displayName: { text: "Paradise Furniture" },
        primaryTypeDisplayName: { text: "Furniture store" },
        types: ["furniture_store"],
        editorialSummary: { text: "A furniture store with home furnishings." },
        formattedAddress: "Test City",
        websiteUri: "https://furniture.example.test",
        delivery: true,
        regularOpeningHours: { weekdayDescriptions: ["Monday: 10 am–6 pm"] },
        attributions: [
          { provider: "Example provider", providerUri: "https://example.test" },
        ],
        reviews: [{ text: "Other customer's private words" }],
      });
    };
    try {
      const profile = await googleBusinessProfile(
        "https://search.google.com/local/writereview?placeid=ChITest123",
      );
      assert.equal(profile?.name, "Paradise Furniture");
      assert.equal(profile?.category, "Furniture store");
      assert.deepEqual(profile?.offerings, ["Delivery available"]);
      assert.equal(profile?.hours.length, 1);
      assert.doesNotMatch(
        JSON.stringify(profile),
        /private-places|Other customer|reviews/,
      );
      await assert.rejects(() =>
        googleBusinessProfile("https://attacker.example/ChITest123"),
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
      if (key === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
      else process.env.GOOGLE_PLACES_API_KEY = key;
    }
  });
  it("keeps missing configuration optional and sanitizes provider failures and profile links", async () => {
    const original = globalThis.fetch,
      key = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        { error: { message: "private-places-key private-provider-body" } },
        { status: 403 },
      );
    };
    try {
      assert.equal(
        await googleBusinessProfile(
          "https://search.google.com/local/writereview?placeid=ChITest123",
        ),
        null,
      );
      assert.equal(calls, 0);
      process.env.GOOGLE_PLACES_API_KEY = "private-places-key";
      await assert.rejects(
        () =>
          googleBusinessProfile(
            "https://search.google.com/local/writereview?placeid=ChITest123",
          ),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.code, "GOOGLE_PROFILE_UNAVAILABLE");
          assert.doesNotMatch(
            error.message + JSON.stringify(error),
            /private-places-key|private-provider-body/,
          );
          return true;
        },
      );
      assert.equal(websiteURL("javascript:alert(1)"), "");
      assert.equal(websiteURL("https://user:secret@example.test"), "");
      assert.equal(websiteURL("https://example.test"), "https://example.test/");
    } finally {
      globalThis.fetch = original;
      if (key === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
      else process.env.GOOGLE_PLACES_API_KEY = key;
    }
  });
});
