import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyWebhook,
  normalizeCashfreeEvent,
  providerTimestamp,
  cashfreeMode,
} from "../lib/server/cashfree";
import { hmacBase64, constantTimeEqual } from "../lib/server/crypto";
import { resolveReviewUrl } from "../lib/server/review-url";
import {
  sameOrigin,
  safeReturnPath,
  jsonBody,
  safeIdempotency,
} from "../lib/server/config";
import {
  publicEventSchema,
  checkoutSchema,
  signupSchema,
} from "../lib/contracts";
import {
  isDeceptiveRequest,
  containsSensitiveDetail,
  numbersPreserved,
} from "../lib/server/ai";
describe("Signed payments and explicit billing enablement", () => {
  it("verifies exact raw bytes and rejects tampering, stale timestamps and missing signatures", async () => {
    const timestamp = String(Date.now());
    const raw = '{"type":"test","amount":399.00}';
    const secret = "test-only-secret";
    const signature = await hmacBase64(secret, timestamp + raw);
    assert.equal(await verifyWebhook(raw, signature, timestamp, secret), true);
    assert.equal(
      await verifyWebhook(
        raw.replace("399", "1"),
        signature,
        timestamp,
        secret,
      ),
      false,
    );
    assert.equal(
      await verifyWebhook(
        raw,
        signature,
        timestamp,
        secret,
        Date.now() + 3600000,
      ),
      false,
    );
    assert.equal(await verifyWebhook(raw, null, timestamp, secret), false);
    assert.equal(constantTimeEqual(signature, signature + "x"), false);
  });
  it("normalizes payment minor units without accepting client prices", () => {
    const event = normalizeCashfreeEvent({
      type: "SUBSCRIPTION_PAYMENT_SUCCESS",
      event_time: "2026-10-11T11:20:00+05:30",
      data: {
        subscription_id: "rp_test",
        cf_payment_id: "payment",
        payment_status: "SUCCESS",
        payment_type: "CHARGE",
        payment_amount: 399,
        payment_currency: "INR",
      },
    });
    assert.equal(event.amount, 39900);
    assert.equal(event.paymentType, "CHARGE");
    assert.equal(
      checkoutSchema.safeParse({
        plan_code: "starter-inr",
        customer_name: "Owner",
        customer_phone: "9999999999",
        amount: 1,
      }).success,
      false,
    );
  });
  it("handles provider timestamps in UTC and IST deterministically", () => {
    assert.equal(
      providerTimestamp("2026-10-11T11:20:00"),
      "2026-10-11T05:50:00.000Z",
    );
    assert.equal(
      providerTimestamp("2026-10-11T11:20:00Z"),
      "2026-10-11T11:20:00.000Z",
    );
    assert.equal(providerTimestamp("invalid"), null);
  });
  it("requires an explicit production switch", () => {
    const old = process.env.CASHFREE_ENVIRONMENT,
      flag = process.env.CASHFREE_LIVE_ENABLED;
    process.env.CASHFREE_ENVIRONMENT = "production";
    delete process.env.CASHFREE_LIVE_ENABLED;
    assert.throws(() => cashfreeMode(), /Live billing/);
    process.env.CASHFREE_ENVIRONMENT = "sandbox";
    assert.equal(cashfreeMode(), "sandbox");
    if (old) process.env.CASHFREE_ENVIRONMENT = old;
    else delete process.env.CASHFREE_ENVIRONMENT;
    if (flag) process.env.CASHFREE_LIVE_ENABLED = flag;
    else delete process.env.CASHFREE_LIVE_ENABLED;
  });
});
describe("Origin, body and URL security", () => {
  it("rejects cross-origin mutations and external return paths", () => {
    const old = process.env.APP_URL;
    process.env.APP_URL = "https://reputly.example";
    assert.throws(
      () =>
        sameOrigin(
          new Request("https://reputly.example/api", {
            method: "POST",
            headers: { origin: "https://evil.example" },
          }),
        ),
      /could not be verified/,
    );
    assert.doesNotThrow(() =>
      sameOrigin(
        new Request("https://reputly.example/api", {
          method: "POST",
          headers: { origin: "https://reputly.example" },
        }),
      ),
    );
    for (const path of [
      "//evil.test",
      "https://evil.test",
      "/\\evil.test",
      "/\npath",
    ])
      assert.equal(safeReturnPath(path), "/app");
    if (old) process.env.APP_URL = old;
    else delete process.env.APP_URL;
  });
  it("bounds streamed request bodies and rejects invalid JSON and missing idempotency", async () => {
    await assert.rejects(
      () =>
        jsonBody(
          new Request("https://app.test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '"' + "a".repeat(30) + '"',
          }),
          10,
        ),
      /too large/,
    );
    await assert.rejects(
      () =>
        jsonBody(
          new Request("https://app.test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        ),
      /invalid JSON/,
    );
    assert.throws(
      () => safeIdempotency(new Request("https://app.test")),
      /Idempotency-Key/,
    );
  });
  it("checks every redirect and never fetches arbitrary or private hosts", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      });
    }) as typeof fetch;
    await assert.rejects(() =>
      resolveReviewUrl("https://127.0.0.1/review", fetcher),
    );
    assert.equal(calls, 0);
    await assert.rejects(
      () => resolveReviewUrl("https://g.page/r/test/review", fetcher),
      /unsupported/,
    );
    assert.equal(calls, 1);
  });
  it("resolves only supported Google short links to canonical destinations", async () => {
    const target =
      "https://search.google.com/local/writereview?placeid=ChITest123";
    assert.equal(
      await resolveReviewUrl(
        "https://g.page/r/test/review",
        (async () =>
          new Response(null, {
            status: 302,
            headers: { location: target },
          })) as typeof fetch,
      ),
      target,
    );
  });
  it("rejects forged AI-completion events and narrative analytics payloads", () => {
    const event = {
      session_token: "a".repeat(64),
      event_id: crypto.randomUUID(),
      event_type: "qr_opened",
    };
    assert.equal(publicEventSchema.safeParse(event).success, true);
    assert.equal(
      publicEventSchema.safeParse({
        ...event,
        event_type: "ai_draft_completed",
      }).success,
      false,
    );
    assert.equal(
      publicEventSchema.safeParse({
        ...event,
        source_text: "private narrative",
      }).success,
      false,
    );
  });
});
describe("Narrative safety", () => {
  it("requires strong passwords and explicit signup terms", () => {
    assert.equal(
      signupSchema.safeParse({
        name: "Owner",
        email: "owner@example.test",
        password: "weak",
        terms_accepted: true,
      }).success,
      false,
    );
  });
  it("detects requests for fabricated experiences and direct contact information", () => {
    assert.equal(
      isDeceptiveRequest("Please invent an experience for twenty customers"),
      true,
    );
    assert.equal(containsSensitiveDetail("Call me on +91 9876543210"), true);
    assert.equal(containsSensitiveDetail("My mail is test@example.com"), true);
    assert.equal(
      isDeceptiveRequest("The service was slow and the food was cold."),
      false,
    );
  });
  it("rejects new numeric claims while allowing faithful wording", () => {
    assert.equal(
      numbersPreserved("We waited 20 minutes.", "We waited 5 minutes."),
      false,
    );
    assert.equal(
      numbersPreserved("We waited 20 minutes.", "Our wait was 20 minutes."),
      true,
    );
  });
});
