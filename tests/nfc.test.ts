import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nfcReviewURL, writeReviewTag, nfcError, type NDEFWriter } from "../lib/nfc";
import { qrSchema, qrPatch } from "../lib/contracts";
import { rateLimitIdentity } from "../lib/server/request-security";
const slug = "secure_review_slug_1234567890";
describe("NFC programming boundaries", () => {
  it("writes only a stable HTTPS customer URL, with cancellation and no implicit overwrite", async () => {
    let message: unknown, options: unknown;
    class Writer implements NDEFWriter { async write(m: unknown, o: unknown) { message = m; options = o; } }
    const controller = new AbortController();
    const url = nfcReviewURL("https://reviews.example", slug);
    await writeReviewTag({ NDEFReader: Writer, isSecureContext: true }, url, controller.signal);
    assert.deepEqual(message, { records: [{ recordType: "url", data: url }] });
    assert.deepEqual(options, { signal: controller.signal, overwrite: false });
    await writeReviewTag({ NDEFReader: Writer, isSecureContext: true }, url, controller.signal, true);
    assert.equal((options as { overwrite: boolean }).overwrite, true);
  });
  it("rejects insecure, credential-bearing and malformed chip destinations", async () => {
    for (const origin of ["http://example.com", "javascript:alert(1)", "https://user:pass@example.com"]) assert.throws(() => nfcReviewURL(origin, slug));
    assert.throws(() => nfcReviewURL("https://example.com", "../admin"));
    class Writer implements NDEFWriter { async write() { assert.fail("must not write an invalid URL"); } }
    for (const url of [`https://example.com/r/${slug}?redirect=evil`, "https://example.com/admin", `http://example.com/r/${slug}`]) {
      await assert.rejects(() => writeReviewTag({ NDEFReader: Writer, isSecureContext: true }, url, new AbortController().signal));
    }
  });
  it("explains unsupported devices and denied permissions", async () => {
    await assert.rejects(() => writeReviewTag({ isSecureContext: false }, `https://example.com/r/${slug}`, new AbortController().signal), /Android/);
    assert.match(nfcError(new DOMException("denied", "NotAllowedError")), /permission was denied/);
    assert.match(nfcError(new DOMException("cancelled", "AbortError")), /Writing stopped/);
  });
  it("keeps old QR creation compatible and forbids channel or destination changes", () => {
    const base = { location_id: "10000000-0000-4000-8000-000000000001" };
    assert.equal(qrSchema.parse(base).channel, "qr");
    assert.equal(qrSchema.parse({ ...base, channel: "nfc", placement: " Front desk " }).placement, "Front desk");
    assert.equal(qrSchema.safeParse({ ...base, channel: "nfc", placement: "x".repeat(101) }).success, false);
    for (const patch of [{ channel: "qr" }, { location_id: base.location_id }, { slug }, { url: "https://evil.example" }]) assert.equal(qrPatch.safeParse(patch).success, false);
  });
});
describe("Trusted ingress rate limits", () => {
  it("ignores spoofed IP headers unless an ingress is explicitly trusted", () => {
    const request = new Request("https://app.test", { headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" } });
    assert.equal(rateLimitIdentity(request, ""), "untrusted-ingress");
    assert.equal(rateLimitIdentity(request, "cloudflare"), "1.2.3.4");
    assert.equal(rateLimitIdentity(request, "vercel"), "5.6.7.8");
  });
  it("rejects malformed addresses and proxy chains", () => {
    for (const value of ["999.0.0.1", "1.2.3.4, 5.6.7.8", "unbounded-input", "1.2.3", "::invalid"]) {
      assert.equal(rateLimitIdentity(new Request("https://app.test", { headers: { "cf-connecting-ip": value } }), "cloudflare"), "untrusted-ingress");
    }
    assert.equal(rateLimitIdentity(new Request("https://app.test", { headers: { "cf-connecting-ip": "2001:db8::1" } }), "cloudflare"), "2001:db8::1");
  });
});
