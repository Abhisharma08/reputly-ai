import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { aiConfiguration, structuredCall } from "../lib/server/ai-provider";
import { AIProviderError } from "../lib/server/ai-error";
import { mentionsRatingScore } from "../lib/review-assistance";

// Sends one synthetic request; prints no keys, prompts, response bodies or drafts.
const file = process.argv[2] || [".dev.vars", ".env.local"].find(existsSync);
const local = file ? parseEnv(readFileSync(file, "utf8")) : {};
const originalFetch = globalThis.fetch;
const secrets = Object.entries({ ...local, ...process.env })
  .filter(
    ([name, value]) =>
      /KEY|SECRET|TOKEN|PASSWORD/.test(name) && value && value.length >= 8,
  )
  .map(([, value]) => value!);
// This standalone check uses synthetic text only. Show a redacted error message
// to diagnose generic 400s; application routes never expose provider messages.
globalThis.fetch = async (url, options) => {
  const response = await originalFetch(url, options);
  if (!response.ok) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: { message?: unknown } } | null;
    if (typeof body?.error?.message === "string") {
      let message = body.error.message;
      for (const secret of secrets)
        message = message.replaceAll(secret, "[redacted]");
      message = message
        .replace(
          /AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|Bearer\s+\S+/g,
          "[redacted]",
        )
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted email]")
        .replace(/https?:\/\/[^\s"']+/gi, "[provider URL]");
      console.error(
        JSON.stringify({
          provider_http_status: response.status,
          provider_message: message.slice(0, 600),
        }),
      );
    }
  }
  return response;
};
for (const name of [
  "AI_ENABLED",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
]) {
  if (process.env[name] === undefined && local[name] !== undefined)
    process.env[name] = local[name];
}
try {
  const config = aiConfiguration();
  const result = await structuredCall(
    config,
    "Write exactly four distinct, short alternatives for one customer's overall opinion of Sample Cafe, guided by a positive rating. No numeric or written-out star scores, no specific service/food/staff/visit claims. Return only JSON with drafts, an array of four strings.",
    JSON.stringify({
      business_profile: { name: "Sample Cafe", category: "Cafe" },
      selected_rating: 4,
      locale: "en",
    }),
    {
      type: "object",
      properties: {
        drafts: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: { type: "string", maxLength: 700 },
        },
      },
      required: ["drafts"],
      additionalProperties: false,
    },
    "review_draft",
    AbortSignal.timeout(15_000),
  );
  const drafts = (result.result as { drafts?: unknown })?.drafts;
  const valid =
    Array.isArray(drafts) &&
    drafts.length === 4 &&
    new Set(drafts).size === 4 &&
    drafts.every(
      (draft) =>
        typeof draft === "string" &&
        draft.trim() &&
        draft.length <= 700 &&
        !mentionsRatingScore(draft),
    );
  console.log(
    JSON.stringify({
      ai_provider: config.provider,
      generation_check: valid ? "passed" : "invalid_review_options",
    }),
  );
  if (!valid) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof AIProviderError
        ? {
            ai_provider: error.provider,
            ai_reason: error.reason,
            provider_http_status: error.httpStatus,
            network_code: error.networkCode,
            network_detail: error.networkDetail,
            provider_rejection: error.rejection,
            rejected_field: error.rejectedField,
          }
        : { ai_reason: "configuration_missing_or_invalid" },
    ),
  );
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
