// Exercise compiled Next.js route handlers in their real request context without
// opening a socket or contacting any external service. Run after build:next.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const require = createRequire(import.meta.url);
process.env.APP_URL = "https://reputly.example.test";
process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SESSION_HASH_SECRET = "test-session-hash-secret";
process.env.AI_ENABLED = "true";
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
process.env.CASHFREE_WEBHOOK_SECRET = "test-webhook-secret";
const { NextRequest } = require("next/server");
const {
  routeModule,
} = require("../.next/server/app/api/v1/[...path]/route.js");
let outbound = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  outbound++;
  throw new Error("Unexpected external request in smoke check");
};
const context = {
  params: Promise.resolve({ path: [] }),
  renderOpts: {
    supportsDynamicResponse: true,
    experimental: {},
    onInstrumentationRequestError: () => {},
  },
  previewProps: {
    previewModeId: "test",
    previewModeSigningKey: "test",
    previewModeEncryptionKey: "test",
  },
  sharedContext: { buildId: "test", deploymentId: "test" },
};
try {
  for (const path of [
    "auth/me",
    "orgs/10000000-0000-4000-8000-000000000001",
    "orgs/10000000-0000-4000-8000-000000000001/billing",
    "admin/overview",
  ]) {
    const response = await routeModule.handle(
      new NextRequest(`https://reputly.example.test/api/v1/${path}`),
      context,
    );
    assert.equal(response.status, 401, path);
    const body = await response.json();
    assert.equal(body.error.code, "AUTH_REQUIRED");
    assert.ok(response.headers.get("x-request-id"));
  }
  const csrf = await routeModule.handle(
    new NextRequest("https://reputly.example.test/api/v1/orgs", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    context,
  );
  assert.equal(csrf.status, 403);
  const signature = await routeModule.handle(
    new NextRequest("https://reputly.example.test/api/v1/webhooks/cashfree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    context,
  );
  assert.equal(signature.status, 401);
  const returned = await routeModule.handle(
    new NextRequest("https://reputly.example.test/api/v1/billing/return", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "status=SUCCESS&amount=1",
    }),
    context,
  );
  assert.equal(returned.status, 303);
  assert.equal(
    returned.headers.get("location"),
    "https://reputly.example.test/app/billing?returned=1",
  );
  assert.equal(outbound, 0);
  const privateLookup = await routeModule.handle(
    new NextRequest(
      "https://reputly.example.test/api/v1/orgs/10000000-0000-4000-8000-000000000001/review-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://reputly.example.test",
        },
        body: JSON.stringify({
          url: "https://search.google.com/local/writereview?placeid=ChITest123",
        }),
      },
    ),
    context,
  );
  assert.equal(privateLookup.status, 401);
  assert.equal(
    outbound,
    0,
    "Unauthenticated lookup must not call Google or Supabase",
  );
  // Exercise the entire compiled public AI route, including its DB-backed
  // business profile, generation, verification, quota completion and errors.
  // All services below are synthetic in-memory HTTP responses.
  const drafts = [
    "Overall, my experience with Sample Furniture was good.",
    "I had a good overall experience with Sample Furniture.",
    "My overall impression of Sample Furniture was positive.",
    "Looking back, I feel positive about my experience with Sample Furniture.",
  ];
  const providerInputs = [],
    completed = [],
    logged = [];
  let placesCalls = 0;
  let reservations = 0,
    repeatBatch = false,
    alwaysRepeat = false;
  const freshDrafts = [
    "Sample Furniture left me pleased with the selection.",
    "I'm happy with the furniture selection at Sample Furniture.",
    "The selection at Sample Furniture made a positive impression on me.",
    "My experience with the selection at Sample Furniture felt good overall.",
  ];
  let simulateDisconnect = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" ? input : input.url || input);
    if (url.hostname === "places.googleapis.com") {
      placesCalls++;
      assert.equal(
        new Headers(options.headers).get("x-goog-api-key"),
        "test-places-key",
      );
      return Response.json({
        id: "ChITest123",
        displayName: { text: "Sample Furniture" },
        primaryTypeDisplayName: { text: "Furniture" },
        editorialSummary: { text: "Home furnishings store." },
        delivery: true,
      });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      assert.equal(
        new Headers(options.headers).get("x-goog-api-key"),
        "test-gemini-key",
      );
      assert.equal(url.search, "");
      if (simulateDisconnect)
        throw new Error(
          "Network connection lost: private-review-text test-gemini-key",
        );
      const request = JSON.parse(options.body);
      const data = JSON.parse(request.contents[0].parts[0].text);
      assert.equal(
        request.generationConfig.responseFormat.text.mimeType,
        "APPLICATION_JSON",
      );
      assert.equal(data.business_profile.name, "Sample Furniture");
      assert.equal(data.business_profile.category, "Furniture");
      assert.equal(data.business_profile.about, "Home furnishings store.");
      assert.deepEqual(data.business_profile.offerings, ["Delivery available"]);
      assert.deepEqual(data.selected_experience_topics, ["selection"]);
      providerInputs.push(data);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    data.candidates
                      ? {
                          checks: drafts.map(() => ({
                            faithful: true,
                            sentiment_preserved: true,
                            no_new_facts: true,
                          })),
                        }
                      : {
                          drafts:
                            repeatBatch &&
                            data.regenerate_repeated_batch &&
                            !alwaysRepeat
                              ? freshDrafts
                              : drafts,
                        },
                  ),
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 40 },
      });
    }
    assert.equal(
      url.hostname,
      "supabase.example.test",
      "Unexpected outbound host",
    );
    const resource = url.pathname.split("/").pop();
    if (resource === "consume_rate_limit") return Response.json(true);
    if (resource === "reserve_ai") {
      reservations++;
      return Response.json("10000000-0000-4000-8000-000000000005");
    }
    if (resource === "finish_ai") {
      completed.push(JSON.parse(options.body));
      return Response.json(null);
    }
    if (resource === "technical_errors")
      return new Response(null, { status: 201 });
    if (resource === "public_sessions")
      return Response.json([
        {
          id: "10000000-0000-4000-8000-000000000001",
          qr_code_id: "10000000-0000-4000-8000-000000000002",
          ai_attempts: 0,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ]);
    if (resource === "qr_codes")
      return Response.json([
        {
          id: "10000000-0000-4000-8000-000000000002",
          organization_id: "10000000-0000-4000-8000-000000000003",
          location_id: "10000000-0000-4000-8000-000000000004",
          slug: "SampleQRabcdefghijklmnop",
          is_active: true,
        },
      ]);
    if (resource === "locations")
      return Response.json([
        {
          id: "10000000-0000-4000-8000-000000000004",
          name: "Sample Furniture",
          category: "Furniture",
          status: "active",
          google_review_url:
            "https://search.google.com/local/writereview?placeid=ChITest123",
        },
      ]);
    if (resource === "organizations")
      return Response.json([{ status: "active" }]);
    throw new Error("Unexpected synthetic DB request");
  };
  const rewriteRequest = (history = ["Previous customer option"]) =>
    new NextRequest(
      "https://reputly.example.test/api/v1/public/assist/rewrite",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://reputly.example.test",
        },
        body: JSON.stringify({
          session_token: "synthetic-public-session-token-123456789",
          source_text: "",
          optional_rating: 4,
          locale: "en",
          experience_topics: ["selection"],
          previous_drafts: history,
        }),
      },
    );
  const generated = await routeModule.handle(rewriteRequest(), context);
  assert.equal(generated.status, 200);
  const generatedBody = await generated.json();
  assert.deepEqual(generatedBody.data.drafts, drafts);
  assert.equal(generatedBody.data.unchanged, false);
  assert.equal(generatedBody.data.business_context, "google");
  assert.equal(placesCalls, 1);
  assert.deepEqual(providerInputs[0].previous_options, [
    "Previous customer option",
  ]);
  assert.equal(typeof providerInputs[0].variation_id, "string");
  assert.equal(providerInputs.length, 2);
  assert.equal(providerInputs[0].rating_for_tone_only, 4);
  assert.deepEqual(providerInputs[1].candidates, drafts);
  assert.equal(completed[0].p_status, "completed");
  assert.doesNotMatch(
    JSON.stringify(completed),
    /Sample Furniture|experience|drafts|Home furnishings|selection/,
  );
  repeatBatch = true;
  const refreshed = await routeModule.handle(rewriteRequest(drafts), context);
  assert.equal(refreshed.status, 200);
  assert.deepEqual((await refreshed.json()).data.drafts, freshDrafts);
  assert.equal(providerInputs.length, 5); // Initial pair + generation re-roll + verifier.
  assert.equal(reservations, 2); // Still one reservation for each batch.
  assert.equal(providerInputs[3].regenerate_repeated_batch, true);
  assert.notEqual(
    providerInputs[2].variation_id,
    providerInputs[3].variation_id,
  );
  assert.equal(completed[1].p_input, 60);
  assert.equal(completed[1].p_output, 120);
  alwaysRepeat = true;
  const repeated = await routeModule.handle(rewriteRequest(drafts), context);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).data.unchanged, true);
  assert.equal(providerInputs.length, 7); // Re-roll stays bounded; no verifier for repeated options.
  assert.equal(reservations, 3);
  assert.equal(completed[2].p_status, "fallback");
  simulateDisconnect = true;
  const originalError = console.error;
  console.error = (entry) => logged.push(entry);
  try {
    const failed = await routeModule.handle(rewriteRequest(), context);
    assert.equal(failed.status, 503);
    const failureBody = await failed.json();
    assert.equal(failureBody.error.code, "AI_UNAVAILABLE");
    assert.doesNotMatch(
      JSON.stringify(failureBody),
      /network_detail|private-review|test-gemini-key/,
    );
    const diagnostic = logged
      .map((entry) => JSON.parse(entry))
      .find((entry) => entry.code === "AI_UNAVAILABLE");
    assert.equal(diagnostic.ai_stage, "generation");
    assert.equal(diagnostic.network_detail, "connection_lost");
    assert.doesNotMatch(logged.join(""), /private-review|test-gemini-key/);
    assert.equal(completed.at(-1).p_status, "failed");
  } finally {
    console.error = originalError;
  }
  console.log(
    "Compiled API checks passed: authentication, CSRF, payment protections, Google business context, four verified AI options, bounded repeat prevention and safe connection diagnostics. All provider/DB calls mocked; no external requests.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
