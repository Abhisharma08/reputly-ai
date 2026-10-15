import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIProviderError, networkErrorCode, networkErrorDetail } from "../lib/server/ai-error";
import {
  aiConfiguration,
  aiAvailable,
  structuredCall,
} from "../lib/server/ai-provider";
const config = {
  provider: "gemini" as const,
  model: "gemini-test",
  apiKey: "private-test-key",
};
const schema = {
  type: "object",
  properties: { draft: { type: "string" } },
  required: ["draft"],
  additionalProperties: false,
};

describe("Gemini provider transport", () => {
  it("uses the required MIME enum so Google's reported 400 cannot recur", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (_input, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      if (
        body.generationConfig.responseFormat?.text.mimeType ===
        "application/json"
      )
        return Response.json(
          {
            error: {
              message:
                "Invalid value at 'generation_config.response_format.text.mime_type' (type.googleapis.com/google.ai.generativelanguage.v1beta.TextResponseFormat.MimeType), \"application/json\"",
            },
          },
          { status: 400 },
        );
      assert.equal(
        body.generationConfig.responseFormat.text.mimeType,
        "APPLICATION_JSON",
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"draft":"A review"}' }] },
          },
        ],
      });
    };
    try {
      assert.deepEqual(
        (
          await structuredCall(
            config,
            "Instructions",
            "Input",
            schema,
            "draft",
            new AbortController().signal,
          )
        ).result,
        { draft: "A review" },
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
    }
  });
  it("keeps keys out of URLs and excludes thinking text from structured output", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      assert.equal(
        String(input),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      );
      assert.doesNotMatch(String(input), /private-test-key/);
      assert.equal(
        new Headers(options?.headers).get("x-goog-api-key"),
        config.apiKey,
      );
      assert.equal(options?.redirect, "error");
      const body = JSON.parse(String(options?.body));
      assert.equal(
        body.generationConfig.responseFormat.text.mimeType,
        "APPLICATION_JSON",
      );
      assert.deepEqual(
        body.generationConfig.responseFormat.text.schema,
        schema,
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: "private reasoning", thought: true },
                { text: '{"draft":"A review"}' },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 2,
        },
      });
    };
    try {
      const result = await structuredCall(
        config,
        "Instructions",
        "Input",
        schema,
        "draft",
        new AbortController().signal,
      );
      assert.deepEqual(result.result, { draft: "A review" });
      assert.equal(result.input_tokens, 10);
      assert.equal(result.output_tokens, 7);
    } finally {
      globalThis.fetch = original;
    }
  });
  it("rejects errors, blocked content and truncated output without exposing provider bodies", async () => {
    const original = globalThis.fetch;
    try {
      for (const response of [
        Response.json(
          { error: { message: "private-test-key" } },
          { status: 429 },
        ),
        Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
        Response.json({
          candidates: [
            {
              finishReason: "MAX_TOKENS",
              content: { parts: [{ text: '{"draft":"partial' }] },
            },
          ],
        }),
      ]) {
        globalThis.fetch = async () => response;
        await assert.rejects(
          structuredCall(
            config,
            "Instructions",
            "Input",
            schema,
            "draft",
            new AbortController().signal,
          ),
          (error: Error) => {
            assert.doesNotMatch(error.message, /private-test-key|partial/);
            return true;
          },
        );
      }
    } finally {
      globalThis.fetch = original;
    }
  });
  it("only advertises assistance when the selected provider is configured", () => {
    const keys = [
      "AI_ENABLED",
      "AI_PROVIDER",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
    ];
    const saved = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    try {
      Object.assign(process.env, {
        AI_ENABLED: "true",
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-test",
      });
      assert.equal(aiAvailable(), true);
      assert.equal(aiConfiguration().provider, "gemini");
      process.env.GEMINI_MODEL = "../untrusted-host";
      assert.equal(aiAvailable(), false);
      process.env.GEMINI_MODEL = "gemini-test";
      delete process.env.GEMINI_API_KEY;
      assert.equal(aiAvailable(), false);
      process.env.GEMINI_API_KEY = "test-key";
      process.env.AI_ENABLED = "false";
      assert.equal(aiAvailable(), false);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  it("reports safe HTTP categories without retrying credentials, quota or unrelated request failures", async () => {
    const original = globalThis.fetch;
    try {
      for (const [status, reason] of [
        [401, "access_denied"],
        [403, "access_denied"],
        [402, "billing_required"],
        [404, "model_unavailable"],
        [429, "rate_limited"],
        [500, "provider_unavailable"],
        [400, "request_rejected"],
      ] as const) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return Response.json(
            {
              error: {
                message:
                  "Invalid schema: private-test-key private customer words",
              },
            },
            { status },
          );
        };
        await assert.rejects(
          structuredCall(
            config,
            "Private instructions",
            "Private input",
            schema,
            "draft",
            new AbortController().signal,
          ),
          (error) => {
            assert.ok(error instanceof AIProviderError);
            assert.equal(error.reason, reason);
            assert.equal(error.httpStatus, status);
            assert.doesNotMatch(
              JSON.stringify(error) + error.message,
              /private-test-key|customer words|Private input/,
            );
            return true;
          },
        );
        assert.equal(calls, 1);
      }
      globalThis.fetch = async () =>
        Response.json(
          {
            error: {
              message: "private-test-key",
              details: [{ reason: "API_KEY_INVALID" }],
            },
          },
          { status: 400 },
        );
      await assert.rejects(
        structuredCall(
          config,
          "Instructions",
          "Input",
          schema,
          "draft",
          new AbortController().signal,
        ),
        (error) =>
          error instanceof AIProviderError && error.reason === "invalid_key",
      );
    } finally {
      globalThis.fetch = original;
    }
  });
  it("retries only an explicit unsupported responseFormat field using the same JSON schema", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (_input, options) => {
      const body = JSON.parse(String(options?.body));
      calls++;
      if (calls === 1)
        return Response.json(
          {
            error: {
              message:
                'Invalid JSON payload received. Unknown name "responseFormat" at generation_config.',
            },
          },
          { status: 400 },
        );
      assert.equal(body.generationConfig.responseFormat, undefined);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"draft":"A review"}' }] },
          },
        ],
      });
    };
    try {
      assert.deepEqual(
        (
          await structuredCall(
            config,
            "Instructions",
            "Input",
            schema,
            "draft",
            new AbortController().signal,
          )
        ).result,
        { draft: "A review" },
      );
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = original;
    }
  });
  it("reports connection codes and timeouts while omitting arbitrary error messages and codes", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError("Private customer words", {
        cause: { code: "ENOTFOUND", message: "private-test-key" },
      });
    };
    try {
      await assert.rejects(
        structuredCall(
          config,
          "Instructions",
          "Input",
          schema,
          "draft",
          new AbortController().signal,
        ),
        (error) => {
          assert.ok(error instanceof AIProviderError);
          assert.equal(error.reason, "network_error");
          assert.equal(error.networkCode, "ENOTFOUND");
          assert.doesNotMatch(
            JSON.stringify(error) + error.message,
            /private-test-key|Private customer/,
          );
          return true;
        },
      );
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        structuredCall(
          config,
          "Instructions",
          "Input",
          schema,
          "draft",
          controller.signal,
        ),
        (error) =>
          error instanceof AIProviderError && error.reason === "timeout",
      );
      assert.equal(
        networkErrorCode({ cause: { code: "private-test-key" } }),
        undefined,
      );
      assert.equal(
        networkErrorCode({ cause: { errors: [{ code: "ECONNRESET" }] } }),
        "ECONNRESET",
      );
    } finally {
      globalThis.fetch = original;
    }
  });
  it("distinguishes malformed output from connection failures", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "private malformed output" }] },
          },
        ],
      });
    try {
      await assert.rejects(
        structuredCall(
          config,
          "Instructions",
          "Input",
          schema,
          "draft",
          new AbortController().signal,
        ),
        (error) =>
          error instanceof AIProviderError &&
          error.reason === "invalid_response",
      );
    } finally {
      globalThis.fetch = original;
    }
  });
  it("classifies code-free Worker connection errors without exposing messages", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Network connection lost: private-customer-text private-test-key");
    };
    try {
      await assert.rejects(
        structuredCall(config, "Instructions", "Input", schema, "draft", new AbortController().signal),
        (error) => {
          assert.ok(error instanceof AIProviderError);
          assert.equal(error.reason, "network_error");
          assert.equal(error.networkDetail, "connection_lost");
          assert.equal(error.networkCode, undefined);
          assert.doesNotMatch(JSON.stringify(error), /private-customer|private-test-key/);
          return true;
        },
      );
      assert.equal(networkErrorDetail({ cause: { message: "TLS certificate failure" } }), "tls_failure");
      assert.equal(networkErrorDetail({ message: "Cannot perform I/O on behalf of a different request" }), "request_context");
      assert.equal(networkErrorDetail({ message: "private-test-key" }), "unclassified");
    } finally {
      globalThis.fetch = original;
    }
  });
  it("does not retry unrelated generic invalid arguments", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        { error: { message: "Request contains an invalid argument." } },
        { status: 400 },
      );
    };
    try {
      await assert.rejects(
        structuredCall(
          config,
          "Instructions",
          "Input",
          schema,
          "draft",
          new AbortController().signal,
        ),
        (error) =>
          error instanceof AIProviderError &&
          error.rejection === "invalid_argument",
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
    }
  });
  it("identifies expired keys, blocked regions and unsupported fields using fixed diagnostic labels", async () => {
    const original = globalThis.fetch;
    try {
      for (const [message, rejection] of [
        ["Your API key has expired. Please renew it.", "expired_key"],
        [
          "User location is not supported for the API use.",
          "unsupported_region",
        ],
        [
          "Unknown name 'private field': Cannot find field.",
          "unsupported_field",
        ],
      ] as const) {
        globalThis.fetch = async () =>
          Response.json({ error: { message } }, { status: 400 });
        await assert.rejects(
          structuredCall(
            config,
            "Instructions",
            "Input",
            schema,
            "draft",
            new AbortController().signal,
          ),
          (error) => {
            assert.ok(error instanceof AIProviderError);
            assert.equal(error.rejection, rejection);
            assert.equal(error.rejectedField, undefined);
            return true;
          },
        );
      }
    } finally {
      globalThis.fetch = original;
    }
  });
});
