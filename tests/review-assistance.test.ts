import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ratingDraft,
  reviewSource,
  reviewOptions,
  mentionsRatingScore,
  topicsForCategory,
} from "../lib/review-assistance";
import { rewriteSchema } from "../lib/contracts";
import { rewrite } from "../lib/server/ai";

describe("Automatic rating drafts", () => {
  it("uses only customer-selected highlights and validates refresh history", () => {
    assert.deepEqual(topicsForCategory("Furniture store"), [
      "selection",
      "quality",
      "service",
      "delivery",
      "value",
    ]);
    assert.match(
      reviewSource("", 4, "en", ["selection", "delivery"]),
      /Selection, Delivery/,
    );
    const options = reviewOptions("", 2, "hi", { name: "Paradise Furniture" }, [
      "quality",
    ]);
    assert.ok(options.every((option) => option.includes("गुणवत्ता")));
    const base = {
      session_token: "a".repeat(64),
      locale: "en",
      optional_rating: 4,
    };
    assert.equal(
      rewriteSchema.safeParse({
        ...base,
        experience_topics: ["invented feature"],
      }).success,
      false,
    );
    assert.equal(
      rewriteSchema.safeParse({
        ...base,
        experience_topics: ["service", "service"],
      }).success,
      false,
    );
    assert.equal(
      rewriteSchema.safeParse({
        ...base,
        previous_drafts: Array(5).fill("text"),
      }).success,
      false,
    );
  });
  it("accepts each rating without requiring a narrative", () => {
    for (let rating = 1; rating <= 5; rating++) {
      const parsed = rewriteSchema.parse({
        session_token: "a".repeat(64),
        locale: "en",
        optional_rating: rating,
      });
      assert.equal(parsed.source_text, "");
      assert.ok(ratingDraft(rating));
      assert.equal(mentionsRatingScore(ratingDraft(rating)), false);
    }
  });
  it("rejects absent input, invalid ratings and oversized details", () => {
    const base = { session_token: "a".repeat(64), locale: "en" };
    for (const optional_rating of [0, 6, 2.5, "5"])
      assert.equal(
        rewriteSchema.safeParse({ ...base, optional_rating }).success,
        false,
      );
    assert.equal(rewriteSchema.safeParse(base).success, false);
    assert.equal(
      rewriteSchema.safeParse({ ...base, source_text: "Short" }).success,
      false,
    );
    assert.equal(
      rewriteSchema.safeParse({
        ...base,
        optional_rating: 5,
        source_text: "a".repeat(1501),
      }).success,
      false,
    );
  });
  it("keeps negative customer details even with a high rating", () => {
    const source = "The coffee was cold and the service was slow.";
    assert.equal(reviewSource(source, 5), source);
    assert.equal(reviewSource(source), source);
  });
  it("accepts short details with a rating without inventing specifics", () => {
    const source = reviewSource("Cold coffee", 2);
    assert.match(source, /^Cold coffee/);
    assert.equal(source, "Cold coffee");
    assert.equal(mentionsRatingScore(source), false);
    assert.doesNotMatch(source, /staff|wait|price|recommend/i);
  });
  it("provides Hindi drafts for every rating", () => {
    for (let rating = 1; rating <= 5; rating++) {
      assert.match(ratingDraft(rating, "hi-IN"), /अनुभव/);
      assert.equal(mentionsRatingScore(ratingDraft(rating, "hi-IN")), false);
      assert.equal(reviewSource("", rating, "hi"), ratingDraft(rating, "hi"));
    }
  });
  it("offers four distinct business-specific alternatives for each rating and language", () => {
    for (const locale of ["en", "hi"])
      for (let rating = 1; rating <= 5; rating++) {
        const options = reviewOptions("", rating, locale, {
          name: "Actual Test Cafe",
          category: "Cafe",
        });
        assert.equal(options.length, 4);
        assert.equal(new Set(options).size, 4);
        for (const option of options) {
          assert.match(option, /Actual Test Cafe/);
          assert.equal(mentionsRatingScore(option), false);
          assert.doesNotMatch(option, /food|staff|price|service|recommend/i);
        }
      }
  });
  it("keeps every detail and criticism in each fallback option", () => {
    const details = "The coffee was cold and I waited 20 minutes.";
    const options = reviewOptions(details, 5, "en", {
      name: "Actual Test Cafe",
    });
    for (const option of options) assert.ok(option.includes(details));
  });
  it("recognizes numeric and written-out star scores without rejecting experience numbers", () => {
    for (const score of [
      "4 out of 5",
      "3/5",
      "four stars",
      "five-star experience",
      "5 में से 4 स्टार",
      "५ में से ३",
      "चार स्टार",
      "पाँच में से तीन",
    ])
      assert.equal(mentionsRatingScore(score), true, score);
    assert.equal(
      mentionsRatingScore("We waited 20 minutes and paid 300 rupees."),
      false,
    );
  });
  it("does not accept client-supplied business facts", () => {
    assert.equal(
      rewriteSchema.safeParse({
        session_token: "a".repeat(64),
        locale: "en",
        optional_rating: 5,
        business_profile: { name: "Forged profile" },
      }).success,
      false,
    );
  });
  it("keeps a genuine business name containing star words without permitting an added score", () => {
    assert.equal(
      mentionsRatingScore(
        "My experience with Five Star Cafe was good.",
        "Five Star Cafe",
      ),
      false,
    );
    assert.equal(
      mentionsRatingScore(
        "Five Star Cafe gets four stars from me.",
        "Five Star Cafe",
      ),
      true,
    );
  });
});

describe("Rating-only AI verification and privacy", () => {
  async function run(
    candidate: string | string[],
    faithful: boolean | boolean[] = true,
    provider = "openai",
  ) {
    const names = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
      "AI_ENABLED",
      "AI_PROVIDER",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GOOGLE_PLACES_API_KEY",
      "OPENAI_INPUT_USD_PER_MILLION",
      "OPENAI_OUTPUT_USD_PER_MILLION",
    ];
    const saved = Object.fromEntries(
      names.map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
      OPENAI_API_KEY: "test-ai-key",
      OPENAI_MODEL: "test-model",
      AI_ENABLED: "true",
      AI_PROVIDER: provider,
      GEMINI_API_KEY: "test-gemini-key",
      GEMINI_MODEL: "gemini-test",
    });
    delete process.env.OPENAI_INPUT_USD_PER_MILLION;
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.OPENAI_OUTPUT_USD_PER_MILLION;
    const original = globalThis.fetch;
    const inputs: Record<string, unknown>[] = [];
    const writes: { path: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      const body = options?.body ? JSON.parse(String(options.body)) : null;
      if (
        url.hostname === "api.openai.com" ||
        url.hostname === "generativelanguage.googleapis.com"
      ) {
        inputs.push(body);
        const result =
          inputs.length === 1
            ? {
                drafts: Array.isArray(candidate)
                  ? candidate
                  : [
                      candidate,
                      `My review: ${candidate}`,
                      `Overall feedback: ${candidate}`,
                      `In my own words: ${candidate}`,
                    ],
              }
            : {
                checks: (Array.isArray(faithful)
                  ? faithful
                  : [faithful, faithful, faithful, faithful]
                ).map((pass) => ({
                  faithful: pass,
                  sentiment_preserved: pass,
                  no_new_facts: pass,
                })),
              };
        if (provider === "gemini")
          return Response.json({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: JSON.stringify(result) }] },
              },
            ],
            usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 20 },
          });
        return Response.json({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(result) }],
            },
          ],
          usage: { input_tokens: 8, output_tokens: 20 },
        });
      }
      if (options?.method === "POST") {
        writes.push({ path: url.pathname, body });
        return Response.json(
          url.pathname.endsWith("reserve_ai")
            ? "20000000-0000-4000-8000-000000000001"
            : null,
        );
      }
      if (url.pathname.endsWith("public_sessions"))
        return Response.json({
          id: "session",
          qr_code_id: "qr",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          ai_attempts: 0,
        });
      if (url.pathname.endsWith("qr_codes"))
        return Response.json({
          id: "qr",
          organization_id: "org",
          location_id: "loc",
          slug: "test_public_review_slug_123456789",
          is_active: true,
        });
      if (url.pathname.endsWith("locations"))
        return Response.json({
          name: "Actual Test Cafe",
          category: "Cafe",
          status: "active",
          google_review_url:
            "https://search.google.com/local/writereview?placeid=ChItest",
        });
      if (url.pathname.endsWith("organizations"))
        return Response.json({ status: "active" });
      throw new Error("Unexpected request in AI verification test");
    };
    try {
      const result = await rewrite({
        session_token: "a".repeat(64),
        locale: "en",
        optional_rating: 1,
      });
      return { result, inputs, writes };
    } finally {
      globalThis.fetch = original;
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }
  it("generates and verifies a rating-only opinion without storing review text", async () => {
    const draft = "My overall experience was disappointing.";
    const { result, inputs, writes } = await run(draft);
    assert.equal(result.draft, draft);
    assert.equal(result.drafts.length, 4);
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].store, false);
    assert.equal(JSON.parse(String(inputs[0].input)).rating_only, true);
    assert.equal(
      writes.find((write) => write.path.endsWith("finish_ai"))?.body.p_status,
      "completed",
    );
    assert.doesNotMatch(
      JSON.stringify(writes),
      /disappointing|source_text|draft/,
    );
  });
  it("falls back when a suggestion spells out a rating", async () => {
    const { result, inputs, writes } = await run(
      "My overall rating is 5 out of 5 stars.",
    );
    assert.equal(
      result.draft,
      reviewOptions("", 1, "en", {
        name: "Actual Test Cafe",
        category: "Cafe",
      })[0],
    );
    assert.equal(result.unchanged, true);
    assert.equal(inputs.length, 1);
    assert.equal(
      writes.find((write) => write.path.endsWith("finish_ai"))?.body.p_status,
      "fallback",
    );
  });
  it("falls back when verification rejects tone that contradicts the selected stars", async () => {
    const { result, inputs } = await run(
      "My overall experience was excellent.",
      false,
    );
    assert.equal(result.unchanged, true);
    assert.equal(inputs.length, 2);
    assert.doesNotMatch(result.draft, /excellent/);
  });
  it("falls back when verification rejects invented experience details", async () => {
    const { result } = await run(
      "The food was cold after 1 visit. I give it 1 out of 5 stars.",
      false,
    );
    assert.equal(
      result.draft,
      reviewOptions("", 1, "en", {
        name: "Actual Test Cafe",
        category: "Cafe",
      })[0],
    );
    assert.equal(result.unchanged, true);
  });
  it("uses Gemini for both generation and verification under the same quota", async () => {
    const draft = "My overall experience was disappointing.";
    const { result, inputs, writes } = await run(draft, true, "gemini");
    assert.equal(result.draft, draft);
    assert.equal(result.drafts.length, 4);
    assert.equal(inputs.length, 2);
    assert.equal(
      writes.filter((write) => write.path.endsWith("reserve_ai")).length,
      1,
    );
    assert.equal(
      writes.find((write) => write.path.endsWith("reserve_ai"))?.body.p_model,
      "gemini:gemini-test",
    );
    assert.equal(
      writes.find((write) => write.path.endsWith("finish_ai"))?.body.p_input,
      16,
    );
    assert.equal(
      writes.find((write) => write.path.endsWith("finish_ai"))?.body.p_output,
      40,
    );
    assert.equal(
      (
        inputs[0].generationConfig as {
          responseFormat: { text: { mimeType: string } };
        }
      ).responseFormat.text.mimeType,
      "APPLICATION_JSON",
    );
    assert.doesNotMatch(
      JSON.stringify(writes),
      /disappointing|source_text|draft/,
    );
  });
  it("uses the saved business profile and preserves one attempt for a batch", async () => {
    const { inputs, writes, result } = await run(
      "My overall experience was disappointing.",
    );
    const input = JSON.parse(String(inputs[0].input));
    assert.deepEqual(input.business_profile, {
      name: "Actual Test Cafe",
      category: "Cafe",
    });
    assert.equal(result.drafts.length, 4);
    assert.equal(
      writes.filter((write) => write.path.endsWith("reserve_ai")).length,
      1,
    );
  });
  it("removes an unsafe option and keeps three verified alternatives", async () => {
    const options = [
      "My overall experience was disappointing.",
      "I found the overall experience disappointing.",
      "Overall, this was a disappointing experience.",
      "The food was cold. My overall experience was disappointing.",
    ];
    const { result } = await run(options, [true, true, true, false]);
    assert.deepEqual(result.drafts, options.slice(0, 3));
    assert.equal(result.unchanged, false);
  });
  it("falls back to four starters if fewer than three options are verified", async () => {
    const { result } = await run("My overall experience was disappointing.", [
      true,
      true,
      false,
      false,
    ]);
    assert.equal(result.drafts.length, 4);
    assert.equal(result.unchanged, true);
  });
  it("rejects duplicate generated options", async () => {
    await assert.rejects(
      run(Array(4).fill("My overall experience was disappointing.")),
      (error: { code?: string }) => error.code === "AI_UNAVAILABLE",
    );
  });
});
