import { z } from "zod";
import { ApiError, requiredEnv } from "./config";
import { AIProviderError, networkErrorCode, networkErrorDetail, type AIReason } from "./ai-error";
export type AIConfiguration = {
  provider: "gemini" | "openai";
  model: string;
  apiKey: string;
};
export function aiConfiguration(): AIConfiguration {
  if (process.env.AI_ENABLED !== "true")
    throw new ApiError(
      "AI_UNAVAILABLE",
      503,
      "Writing assistance is unavailable. Your editable draft is still available.",
    );
  const provider =
    process.env.AI_PROVIDER ||
    (process.env.GEMINI_API_KEY ? "gemini" : "openai");
  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    if (!/^gemini-[a-zA-Z0-9.-]+$/.test(model))
      throw new ApiError(
        "SERVICE_NOT_CONFIGURED",
        503,
        "Writing assistance is being configured.",
      );
    return { provider, model, apiKey: requiredEnv("GEMINI_API_KEY") };
  }
  if (provider === "openai")
    return {
      provider,
      model: requiredEnv("OPENAI_MODEL"),
      apiKey: requiredEnv("OPENAI_API_KEY"),
    };
  throw new ApiError(
    "SERVICE_NOT_CONFIGURED",
    503,
    "Writing assistance is being configured.",
  );
}
export function aiAvailable() {
  try {
    aiConfiguration();
    return true;
  } catch {
    return false;
  }
}
export async function structuredCall(
  config: AIConfiguration,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  name: string,
  signal: AbortSignal,
) {
  try {
    return await (config.provider === "gemini"
      ? geminiStructuredCall(config, instructions, input, schema, signal)
      : openaiStructuredCall(
          config,
          instructions,
          input,
          schema,
          name,
          signal,
        ));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const failure = new AIProviderError(
      config.provider,
      signal.aborted
        ? "timeout"
        : error instanceof SyntaxError || error instanceof z.ZodError
          ? "invalid_response"
          : "network_error",
    );
    failure.networkCode = networkErrorCode(error);
    if (failure.reason === "network_error")
      failure.networkDetail = networkErrorDetail(error);
    throw failure;
  }
}
async function providerFailure(
  response: Response,
  provider: AIConfiguration["provider"],
) {
  // Inspect in memory, but expose only categories. Error messages can echo secrets/input.
  const parsed = z
    .object({
      error: z
        .object({
          message: z.string().optional(),
          details: z
            .array(z.object({ reason: z.string().optional() }))
            .optional(),
        })
        .optional(),
    })
    .safeParse(await response.json().catch(() => null));
  const body = parsed.success ? parsed.data : undefined;
  const message =
    typeof body?.error?.message === "string" ? body.error.message : "";
  const invalidKey =
    body?.error?.details?.some?.(
      (detail: { reason?: string }) => detail.reason === "API_KEY_INVALID",
    ) ||
    /API key not valid|invalid API key|invalid_api_key|API key.{0,40}expired/i.test(
      message,
    );
  const reason: AIReason = invalidKey
    ? "invalid_key"
    : response.status === 401 || response.status === 403
      ? "access_denied"
      : response.status === 402
        ? "billing_required"
        : response.status === 404
          ? "model_unavailable"
          : response.status === 429
            ? "rate_limited"
            : response.status >= 500
              ? "provider_unavailable"
              : "request_rejected";
  const error = new AIProviderError(provider, reason, response.status);
  if (/API key.{0,40}expired/i.test(message)) error.rejection = "expired_key";
  else if (/API key.{0,40}blocked|API_KEY_.*BLOCKED/i.test(message))
    error.rejection = "blocked_key";
  else if (
    /API.{0,60}(?:not been used|disabled)|SERVICE_DISABLED/i.test(message)
  )
    error.rejection = "service_disabled";
  else if (
    /(?:location|region|country).{0,60}(?:not supported|unsupported|not available)/i.test(
      message,
    )
  )
    error.rejection = "unsupported_region";
  else if (/unknown name|unknown field|unrecognized/i.test(message)) {
    error.rejection = "unsupported_field";
    const field = message.match(
      /(?:Unknown name|Unknown field|unrecognized field)\s*["']([^"']+)["']/i,
    )?.[1];
    if (
      field &&
      [
        "responseFormat",
        "response_format",
        "responseJsonSchema",
        "responseSchema",
        "responseMimeType",
        "thinkingConfig",
        "thinkingLevel",
        "maxLength",
        "minItems",
        "maxItems",
        "additionalProperties",
        "schema",
        "mimeType",
      ].includes(field)
    )
      error.rejectedField = field;
  } else if (/thinking|thinking_level|thinkingLevel/i.test(message))
    error.rejection = "unsupported_thinking";
  else if (/schema/i.test(message)) error.rejection = "invalid_schema";
  else if (
    /Invalid value at ['"]generation_config\.response_format\.text\.mime_type['"]/i.test(
      message,
    )
  ) {
    error.rejection = "unsupported_field";
    error.rejectedField = "mimeType";
  } else if (response.status === 400) error.rejection = "invalid_argument";
  return {
    error,
    legacyFormat:
      response.status === 400 &&
      (error.rejectedField === "mimeType" ||
        /(?:unknown name|unknown field|unrecognized).*response_?format/i.test(
          message,
        )),
  };
}
async function geminiStructuredCall(
  config: AIConfiguration,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  signal: AbortSignal,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    request = (legacy = false) =>
      fetch(url, {
        method: "POST",
        signal,
        redirect: "error",
        headers: {
          "x-goog-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: input }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            ...(legacy
              ? {
                  responseMimeType: "application/json",
                  responseJsonSchema: schema,
                }
              : {
                  responseFormat: {
                    // TextResponseFormat uses a protobuf enum, not a MIME string.
                    text: { mimeType: "APPLICATION_JSON", schema },
                  },
                }),
          },
        }),
      });
  let response = await request();
  if (!response.ok) {
    const failure = await providerFailure(response, config.provider);
    // Older API deployments accept the previous JSON-schema fields.
    // Try compatible fields only for an unsupported JSON-output field/enum,
    // keeping the same input/schema/deadline.
    if (!failure.legacyFormat) throw failure.error;
    response = await request(true);
    if (!response.ok)
      throw (await providerFailure(response, config.provider)).error;
  }
  const data = z
    .object({
      candidates: z
        .array(
          z.object({
            finishReason: z.string().optional(),
            content: z
              .object({
                parts: z
                  .array(
                    z.object({
                      text: z.string().optional(),
                      thought: z.boolean().optional(),
                    }),
                  )
                  .default([]),
              })
              .optional(),
          }),
        )
        .default([]),
      usageMetadata: z
        .object({
          promptTokenCount: z.number().optional(),
          candidatesTokenCount: z.number().optional(),
          thoughtsTokenCount: z.number().optional(),
        })
        .optional(),
    })
    .parse(await response.json());
  const candidate = data.candidates[0];
  if (!candidate || candidate.finishReason !== "STOP")
    throw new AIProviderError(
      config.provider,
      candidate?.finishReason === "MAX_TOKENS"
        ? "truncated_response"
        : "blocked_response",
    );
  const text =
    candidate.content?.parts
      .filter((part) => !part.thought)
      .map((part) => part.text || "")
      .join("") || "";
  return {
    result: JSON.parse(text),
    input_tokens: data.usageMetadata?.promptTokenCount || 0,
    output_tokens:
      (data.usageMetadata?.candidatesTokenCount || 0) +
      (data.usageMetadata?.thoughtsTokenCount || 0),
  };
}
async function openaiStructuredCall(
  config: AIConfiguration,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  name: string,
  signal: AbortSignal,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      instructions,
      input,
      store: false,
      max_output_tokens: 1800,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!response.ok)
    throw (await providerFailure(response, config.provider)).error;
  const data = z
    .object({
      status: z.string(),
      output: z
        .array(
          z.object({
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        )
        .default([]),
      usage: z
        .object({
          input_tokens: z.number().optional(),
          output_tokens: z.number().optional(),
        })
        .optional(),
    })
    .parse(await response.json());
  if (data.status !== "completed")
    throw new AIProviderError(
      config.provider,
      data.status === "incomplete" ? "truncated_response" : "blocked_response",
    );
  const text = (data.output || [])
    .flatMap(
      (o: { content?: { type: string; text?: string }[] }) => o.content || [],
    )
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c) => c.text || "")
    .join("");
  return {
    result: JSON.parse(text),
    input_tokens: Number(data.usage?.input_tokens) || 0,
    output_tokens: Number(data.usage?.output_tokens) || 0,
  };
}
